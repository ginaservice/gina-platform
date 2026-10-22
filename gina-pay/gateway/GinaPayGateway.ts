/**
 * 💳 GINA Pay — نظام الدفع الإلكتروني المتكامل
 * 
 * بوابة الدفع | المحفظة الرقمية | المعاملات | الامتثال التنظيمي
 */

import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

// ===== Payment Types =====

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
  ON_HOLD = 'on_hold',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  BANK_TRANSFER = 'bank_transfer',
  CRYPTO = 'crypto',
  MOBILE_WALLET = 'mobile_wallet',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
  GINA_WALLET = 'gina_wallet',
}

export enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  SAR = 'SAR',
  AED = 'AED',
  EGP = 'EGP',
  BTC = 'BTC',
  ETH = 'ETH',
  USDT = 'USDT',
}

export interface PaymentRequest {
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  merchantId: string;
  customerId: string;
  description: string;
  metadata?: Record<string, unknown>;
  returnUrl?: string;
  webhookUrl?: string;
}

export interface Transaction {
  id: string;
  referenceId: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  status: TransactionStatus;
  merchantId: string;
  customerId: string;
  description: string;
  fees: TransactionFees;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
  metadata: Record<string, unknown>;
  auditTrail: AuditEntry[];
}

export interface TransactionFees {
  processingFee: number;
  platformFee: number;
  networkFee: number;
  total: number;
  currency: Currency;
}

export interface GinaWallet {
  id: string;
  userId: string;
  balance: Map<Currency, number>;
  frozenBalance: Map<Currency, number>;
  tier: WalletTier;
  limits: WalletLimits;
  isVerified: boolean;
  kycStatus: KYCStatus;
}

export enum WalletTier {
  BASIC = 'basic',       // بدون KYC - حدود منخفضة
  STANDARD = 'standard', // KYC جزئي
  PREMIUM = 'premium',   // KYC كامل - حدود عالية
  ENTERPRISE = 'enterprise', // للشركات
}

export enum KYCStatus {
  NOT_STARTED = 'not_started',
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export interface WalletLimits {
  dailyTransactionLimit: number;
  monthlyTransactionLimit: number;
  singleTransactionLimit: number;
  currency: Currency;
}

// ===== GINA Pay Gateway =====

export class GinaPayGateway extends EventEmitter {
  private merchantId: string;
  private apiKey: string;
  private webhookSecret: string;
  private transactions: Map<string, Transaction> = new Map();

  constructor(config: PaymentGatewayConfig) {
    super();
    this.merchantId = config.merchantId;
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * 💳 معالجة الدفع
   */
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // 1. التحقق من صحة الطلب
    await this.validateRequest(request);

    // 2. فحص الأمان
    await this.securityCheck(request);

    // 3. إنشاء المعاملة
    const transaction = this.createTransaction(request);

    // 4. معالجة حسب طريقة الدفع
    const result = await this.routePayment(transaction);

    // 5. تحديث حالة المعاملة
    await this.updateTransactionStatus(transaction.id, result.status);

    // 6. إرسال Webhook
    if (request.webhookUrl) {
      await this.sendWebhook(request.webhookUrl, transaction);
    }

    this.emit('payment:processed', { transaction, result });
    return result;
  }

  /**
   * 🔄 استرداد المبلغ
   */
  async refund(transactionId: string, amount?: number, reason?: string): Promise<RefundResult> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    if (transaction.status !== TransactionStatus.COMPLETED) {
      throw new Error(`Cannot refund transaction with status: ${transaction.status}`);
    }

    const refundAmount = amount ?? transaction.amount;
    if (refundAmount > transaction.amount) {
      throw new Error('Refund amount exceeds transaction amount');
    }

    const refundTransaction = this.createTransaction({
      amount: -refundAmount,
      currency: transaction.currency,
      method: transaction.method,
      merchantId: transaction.merchantId,
      customerId: transaction.customerId,
      description: `Refund for ${transactionId}: ${reason ?? 'Customer request'}`,
    });

    await this.updateTransactionStatus(transaction.id, TransactionStatus.REFUNDED);
    this.emit('payment:refunded', { original: transaction, refund: refundTransaction });

    return {
      success: true,
      refundId: refundTransaction.id,
      amount: refundAmount,
      currency: transaction.currency,
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * 📊 الحصول على تقرير المعاملات
   */
  async getTransactionReport(
    merchantId: string,
    dateRange: DateRange
  ): Promise<TransactionReport> {
    const merchantTransactions = Array.from(this.transactions.values())
      .filter(t => 
        t.merchantId === merchantId &&
        new Date(t.createdAt) >= new Date(dateRange.from) &&
        new Date(t.createdAt) <= new Date(dateRange.to)
      );

    const summary = merchantTransactions.reduce(
      (acc, t) => {
        acc.totalAmount += t.amount;
        acc.totalFees += t.fees.total;
        acc.byStatus[t.status] = (acc.byStatus[t.status] || 0) + 1;
        acc.byMethod[t.method] = (acc.byMethod[t.method] || 0) + t.amount;
        return acc;
      },
      {
        totalAmount: 0,
        totalFees: 0,
        byStatus: {} as Record<string, number>,
        byMethod: {} as Record<string, number>,
      }
    );

    return {
      merchantId,
      dateRange,
      transactionCount: merchantTransactions.length,
      ...summary,
      netAmount: summary.totalAmount - summary.totalFees,
      transactions: merchantTransactions,
    };
  }

  // ===== Private Methods =====

  private async validateRequest(request: PaymentRequest): Promise<void> {
    if (request.amount <= 0) {
      throw new Error('Payment amount must be positive');
    }
    if (!Object.values(Currency).includes(request.currency)) {
      throw new Error(`Unsupported currency: ${request.currency}`);
    }
    if (!Object.values(PaymentMethod).includes(request.method)) {
      throw new Error(`Unsupported payment method: ${request.method}`);
    }
  }

  private async securityCheck(request: PaymentRequest): Promise<void> {
    // فحص الاحتيال والمعاملات المشبوهة
    if (request.amount > 50000) {
      this.emit('security:high_value_transaction', { request });
    }
  }

  private createTransaction(request: Partial<PaymentRequest> & { amount: number; currency: Currency }): Transaction {
    const id = `txn_${randomBytes(12).toString('hex')}`;
    const fees = this.calculateFees(request.amount, request.currency as Currency, request.method as PaymentMethod);
    
    const transaction: Transaction = {
      id,
      referenceId: `REF-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`,
      amount: request.amount,
      currency: request.currency,
      method: request.method as PaymentMethod,
      status: TransactionStatus.PENDING,
      merchantId: request.merchantId || this.merchantId,
      customerId: request.customerId || '',
      description: request.description || '',
      fees,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: request.metadata || {},
      auditTrail: [{
        action: 'created',
        timestamp: new Date().toISOString(),
        actor: 'system',
      }],
    };

    this.transactions.set(id, transaction);
    return transaction;
  }

  private calculateFees(amount: number, currency: Currency, method: PaymentMethod): TransactionFees {
    const feeRates = {
      [PaymentMethod.CREDIT_CARD]: 0.029,   // 2.9%
      [PaymentMethod.DEBIT_CARD]: 0.015,    // 1.5%
      [PaymentMethod.BANK_TRANSFER]: 0.005, // 0.5%
      [PaymentMethod.CRYPTO]: 0.01,         // 1.0%
      [PaymentMethod.MOBILE_WALLET]: 0.02,  // 2.0%
      [PaymentMethod.APPLE_PAY]: 0.025,     // 2.5%
      [PaymentMethod.GOOGLE_PAY]: 0.025,    // 2.5%
      [PaymentMethod.GINA_WALLET]: 0.005,   // 0.5% - أفضل رسوم!
    };

    const processingFee = amount * (feeRates[method] || 0.025);
    const platformFee = amount * 0.005; // 0.5% رسوم المنصة
    const networkFee = method === PaymentMethod.CRYPTO ? amount * 0.001 : 0;

    return {
      processingFee: Math.round(processingFee * 100) / 100,
      platformFee: Math.round(platformFee * 100) / 100,
      networkFee: Math.round(networkFee * 100) / 100,
      total: Math.round((processingFee + platformFee + networkFee) * 100) / 100,
      currency,
    };
  }

  private async routePayment(transaction: Transaction): Promise<PaymentResult> {
    await this.updateTransactionStatus(transaction.id, TransactionStatus.PROCESSING);

    // محاكاة المعالجة
    const success = Math.random() > 0.05; // 95% نجاح

    if (success) {
      await this.updateTransactionStatus(transaction.id, TransactionStatus.COMPLETED);
      return {
        success: true,
        transactionId: transaction.id,
        referenceId: transaction.referenceId,
        status: TransactionStatus.COMPLETED,
        processedAt: new Date().toISOString(),
      };
    } else {
      await this.updateTransactionStatus(transaction.id, TransactionStatus.FAILED);
      return {
        success: false,
        transactionId: transaction.id,
        referenceId: transaction.referenceId,
        status: TransactionStatus.FAILED,
        errorCode: 'PROCESSING_ERROR',
        errorMessage: 'Payment processor declined the transaction',
      };
    }
  }

  private async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus
  ): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) return;

    transaction.status = status;
    transaction.updatedAt = new Date().toISOString();

    if (status === TransactionStatus.COMPLETED) {
      transaction.completedAt = new Date().toISOString();
    }

    transaction.auditTrail.push({
      action: `status_changed_to_${status}`,
      timestamp: new Date().toISOString(),
      actor: 'system',
    });
  }

  private async sendWebhook(url: string, transaction: Transaction): Promise<void> {
    const payload = {
      event: 'payment.updated',
      timestamp: new Date().toISOString(),
      transaction,
    };

    console.log(`Webhook: Sending to ${url}`, { event: payload.event });
    // في الإنتاج: استخدام fetch أو axios مع التحقق من HMAC
  }

  getTransaction(id: string): Transaction | undefined {
    return this.transactions.get(id);
  }
}

// ===== GINA Wallet Service =====

export class GinaWalletService extends EventEmitter {
  private wallets: Map<string, GinaWallet> = new Map();

  async createWallet(userId: string): Promise<GinaWallet> {
    const wallet: GinaWallet = {
      id: `wallet_${randomBytes(8).toString('hex')}`,
      userId,
      balance: new Map([[Currency.USD, 0]]),
      frozenBalance: new Map(),
      tier: WalletTier.BASIC,
      limits: this.getDefaultLimits(WalletTier.BASIC),
      isVerified: false,
      kycStatus: KYCStatus.NOT_STARTED,
    };

    this.wallets.set(userId, wallet);
    this.emit('wallet:created', { userId, walletId: wallet.id });
    return wallet;
  }

  async deposit(userId: string, amount: number, currency: Currency): Promise<void> {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new Error('Wallet not found');

    const currentBalance = wallet.balance.get(currency) || 0;
    wallet.balance.set(currency, currentBalance + amount);
    this.emit('wallet:deposit', { userId, amount, currency });
  }

  async withdraw(userId: string, amount: number, currency: Currency): Promise<void> {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new Error('Wallet not found');

    const currentBalance = wallet.balance.get(currency) || 0;
    if (currentBalance < amount) {
      throw new Error('Insufficient balance');
    }

    wallet.balance.set(currency, currentBalance - amount);
    this.emit('wallet:withdrawal', { userId, amount, currency });
  }

  async getBalance(userId: string, currency: Currency): Promise<number> {
    const wallet = this.wallets.get(userId);
    if (!wallet) throw new Error('Wallet not found');
    return wallet.balance.get(currency) || 0;
  }

  private getDefaultLimits(tier: WalletTier): WalletLimits {
    const limits = {
      [WalletTier.BASIC]: { daily: 1000, monthly: 5000, single: 500 },
      [WalletTier.STANDARD]: { daily: 10000, monthly: 50000, single: 5000 },
      [WalletTier.PREMIUM]: { daily: 100000, monthly: 500000, single: 50000 },
      [WalletTier.ENTERPRISE]: { daily: 1000000, monthly: 5000000, single: 500000 },
    };

    const { daily, monthly, single } = limits[tier];
    return {
      dailyTransactionLimit: daily,
      monthlyTransactionLimit: monthly,
      singleTransactionLimit: single,
      currency: Currency.USD,
    };
  }
}

// ===== Supporting Interfaces =====

interface PaymentGatewayConfig {
  merchantId: string;
  apiKey: string;
  webhookSecret: string;
}

interface PaymentResult {
  success: boolean;
  transactionId: string;
  referenceId: string;
  status: TransactionStatus;
  processedAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface RefundResult {
  success: boolean;
  refundId: string;
  amount: number;
  currency: Currency;
  processedAt: string;
}

interface AuditEntry {
  action: string;
  timestamp: string;
  actor: string;
  details?: Record<string, unknown>;
}

interface DateRange {
  from: string;
  to: string;
}

interface TransactionReport {
  merchantId: string;
  dateRange: DateRange;
  transactionCount: number;
  totalAmount: number;
  totalFees: number;
  netAmount: number;
  byStatus: Record<string, number>;
  byMethod: Record<string, number>;
  transactions: Transaction[];
}
