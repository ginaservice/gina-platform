/**
 * 🔐 Jina Security Protocols — بروتوكولات الأمان الصارمة
 * 
 * Zero-Trust Architecture | E2E Encryption | MFA | Audit Logs
 * معمارية الثقة الصفرية | التشفير الكامل | المصادقة متعددة العوامل
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { EventEmitter } from 'events';

// ===== Security Constants =====

export const SECURITY_CONSTANTS = {
  ENCRYPTION_ALGORITHM: 'aes-256-gcm',
  KEY_LENGTH: 32,       // 256 bits
  IV_LENGTH: 16,        // 128 bits
  AUTH_TAG_LENGTH: 16,  // 128 bits
  SALT_ROUNDS: 12,
  TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 30 * 60 * 1000, // 30 minutes
  AUDIT_RETENTION_DAYS: 365,
} as const;

// ===== Threat Levels =====

export enum ThreatLevel {
  NONE = 0,
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4,
}

export enum SecurityEvent {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  DATA_ACCESS = 'DATA_ACCESS',
  PAYMENT_ATTEMPT = 'PAYMENT_ATTEMPT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INJECTION_ATTEMPT = 'INJECTION_ATTEMPT',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  MFA_TRIGGERED = 'MFA_TRIGGERED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
}

// ===== Interfaces =====

export interface SecurityContext {
  userId: string;
  sessionId: string;
  ip: string;
  userAgent: string;
  timestamp: number;
  requestPath: string;
  method: string;
}

export interface EncryptionResult {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: string;
}

export interface AuditLog {
  id: string;
  event: SecurityEvent;
  userId?: string;
  ip: string;
  timestamp: string;
  level: ThreatLevel;
  details: Record<string, unknown>;
  signature: string;
}

export interface SecurityAssessment {
  level: ThreatLevel;
  reasons: string[];
  recommendations: string[];
  blocked: boolean;
}

// ===== Encryption Service =====

export class EncryptionService {
  private masterKey: Buffer;

  constructor(masterKey: string) {
    this.masterKey = Buffer.from(masterKey, 'hex');
    if (this.masterKey.length !== SECURITY_CONSTANTS.KEY_LENGTH) {
      throw new Error('Master key must be 256 bits (32 bytes)');
    }
  }

  /**
   * 🔒 تشفير البيانات - AES-256-GCM
   */
  encrypt(plaintext: string): EncryptionResult {
    const iv = randomBytes(SECURITY_CONSTANTS.IV_LENGTH);
    const cipher = createCipheriv(
      SECURITY_CONSTANTS.ENCRYPTION_ALGORITHM,
      this.masterKey,
      iv
    );

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = (cipher as ReturnType<typeof createCipheriv> & { getAuthTag(): Buffer }).getAuthTag();

    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: SECURITY_CONSTANTS.ENCRYPTION_ALGORITHM,
    };
  }

  /**
   * 🔓 فك تشفير البيانات
   */
  decrypt(encrypted: EncryptionResult): string {
    const decipher = createDecipheriv(
      SECURITY_CONSTANTS.ENCRYPTION_ALGORITHM,
      this.masterKey,
      Buffer.from(encrypted.iv, 'hex')
    );

    (decipher as ReturnType<typeof createDecipheriv> & { setAuthTag(tag: Buffer): void })
      .setAuthTag(Buffer.from(encrypted.authTag, 'hex'));

    let decrypted = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * 🔑 توليد مفتاح آمن
   */
  static generateKey(): string {
    return randomBytes(SECURITY_CONSTANTS.KEY_LENGTH).toString('hex');
  }

  /**
   * #️⃣ تشفير أحادي الاتجاه (للكلمات المرور)
   */
  static hash(value: string, salt?: string): string {
    const actualSalt = salt || randomBytes(16).toString('hex');
    const hash = createHash('sha256')
      .update(value + actualSalt)
      .digest('hex');
    return `${actualSalt}:${hash}`;
  }

  static verifyHash(value: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    const computed = createHash('sha256')
      .update(value + salt)
      .digest('hex');
    return computed === hash;
  }
}

// ===== Threat Analyzer =====

export class ThreatAnalyzer extends EventEmitter {
  private loginAttempts: Map<string, LoginAttemptRecord> = new Map();
  private blockedIPs: Set<string> = new Set();
  private suspiciousPatterns = [
    /(\bUNION\b.*\bSELECT\b)/i,         // SQL Injection
    /(<script[\s\S]*?>[\s\S]*?<\/script>)/i, // XSS
    /(\.\.\/|\.\.\\)/,                    // Path Traversal
    /(\$\{.*\})/,                         // Template Injection
    /(\beval\b\s*\()/i,                   // Code Injection
  ];

  /**
   * 🔍 تقييم مستوى التهديد
   */
  assess(context: SecurityContext, payload?: string): SecurityAssessment {
    const reasons: string[] = [];
    const recommendations: string[] = [];
    let maxLevel = ThreatLevel.NONE;

    // فحص IP المحظور
    if (this.blockedIPs.has(context.ip)) {
      return {
        level: ThreatLevel.CRITICAL,
        reasons: ['IP address is blocked'],
        recommendations: ['Contact system administrator'],
        blocked: true,
      };
    }

    // فحص محاولات تسجيل الدخول
    const loginRecord = this.loginAttempts.get(context.ip);
    if (loginRecord && loginRecord.count >= SECURITY_CONSTANTS.MAX_LOGIN_ATTEMPTS) {
      if (Date.now() - loginRecord.lastAttempt < SECURITY_CONSTANTS.LOCKOUT_DURATION) {
        maxLevel = Math.max(maxLevel, ThreatLevel.HIGH);
        reasons.push(`Too many login attempts: ${loginRecord.count}`);
        recommendations.push('Account temporarily locked');
      }
    }

    // فحص الأنماط المشبوهة
    if (payload) {
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(payload)) {
          maxLevel = Math.max(maxLevel, ThreatLevel.CRITICAL);
          reasons.push(`Injection attempt detected: ${pattern.source.slice(0, 30)}`);
          recommendations.push('Request blocked - security violation');
          this.emit('threat:detected', { context, pattern: pattern.source });
        }
      }
    }

    // فحص User-Agent المشبوه
    if (!context.userAgent || context.userAgent.length < 10) {
      maxLevel = Math.max(maxLevel, ThreatLevel.MEDIUM);
      reasons.push('Suspicious user agent');
    }

    return {
      level: maxLevel,
      reasons,
      recommendations,
      blocked: maxLevel >= ThreatLevel.HIGH,
    };
  }

  /**
   * 📝 تسجيل محاولة تسجيل دخول
   */
  recordLoginAttempt(ip: string, success: boolean): void {
    if (success) {
      this.loginAttempts.delete(ip);
      return;
    }

    const existing = this.loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
    existing.count++;
    existing.lastAttempt = Date.now();
    this.loginAttempts.set(ip, existing);

    if (existing.count >= SECURITY_CONSTANTS.MAX_LOGIN_ATTEMPTS) {
      this.emit('account:lockout', { ip, attempts: existing.count });
    }
  }

  blockIP(ip: string): void {
    this.blockedIPs.add(ip);
    this.emit('ip:blocked', { ip, timestamp: new Date().toISOString() });
  }

  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip);
  }
}

// ===== Audit Logger =====

export class AuditLogger {
  private logs: AuditLog[] = [];
  private signingKey: string;

  constructor(signingKey: string) {
    this.signingKey = signingKey;
  }

  /**
   * 📋 تسجيل حدث أمني
   */
  log(event: SecurityEvent, context: Partial<SecurityContext>, details: Record<string, unknown> = {}): AuditLog {
    const entry: AuditLog = {
      id: randomBytes(16).toString('hex'),
      event,
      userId: context.userId,
      ip: context.ip || 'unknown',
      timestamp: new Date().toISOString(),
      level: this.getEventLevel(event),
      details,
      signature: '',
    };

    entry.signature = this.sign(entry);
    this.logs.push(entry);

    // تسجيل الأحداث عالية الخطورة في console
    if (entry.level >= ThreatLevel.HIGH) {
      console.error(`🚨 HIGH SECURITY EVENT: ${event}`, entry);
    }

    return entry;
  }

  private sign(entry: Omit<AuditLog, 'signature'>): string {
    const content = JSON.stringify({ ...entry });
    return createHash('sha256')
      .update(content + this.signingKey)
      .digest('hex');
  }

  verify(log: AuditLog): boolean {
    const { signature, ...rest } = log;
    const expected = this.sign(rest);
    return signature === expected;
  }

  private getEventLevel(event: SecurityEvent): ThreatLevel {
    const levels: Record<SecurityEvent, ThreatLevel> = {
      [SecurityEvent.LOGIN_SUCCESS]: ThreatLevel.NONE,
      [SecurityEvent.DATA_ACCESS]: ThreatLevel.LOW,
      [SecurityEvent.PAYMENT_ATTEMPT]: ThreatLevel.LOW,
      [SecurityEvent.LOGIN_FAILURE]: ThreatLevel.MEDIUM,
      [SecurityEvent.RATE_LIMIT_EXCEEDED]: ThreatLevel.MEDIUM,
      [SecurityEvent.MFA_TRIGGERED]: ThreatLevel.MEDIUM,
      [SecurityEvent.SUSPICIOUS_ACTIVITY]: ThreatLevel.HIGH,
      [SecurityEvent.UNAUTHORIZED_ACCESS]: ThreatLevel.HIGH,
      [SecurityEvent.TOKEN_REVOKED]: ThreatLevel.HIGH,
      [SecurityEvent.ACCOUNT_LOCKED]: ThreatLevel.HIGH,
      [SecurityEvent.INJECTION_ATTEMPT]: ThreatLevel.CRITICAL,
    };
    return levels[event] ?? ThreatLevel.MEDIUM;
  }

  getLogs(filter?: { level?: ThreatLevel; event?: SecurityEvent }): AuditLog[] {
    let result = [...this.logs];
    if (filter?.level !== undefined) {
      result = result.filter(l => l.level >= filter.level!);
    }
    if (filter?.event) {
      result = result.filter(l => l.event === filter.event);
    }
    return result;
  }
}

// ===== Supporting Types =====

interface LoginAttemptRecord {
  count: number;
  lastAttempt: number;
}
