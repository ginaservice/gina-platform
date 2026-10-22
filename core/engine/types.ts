/**
 * 🧬 GINA Platform — Core Engine
 * الخوارزمية الخماسية للتنفيذ
 * 
 * Phase 1: Architecture Bootstrap
 * Phase 2: Chameleon Skills Layer
 * Phase 3: Security Hardening
 * Phase 4: Google Integration
 * Phase 5: GINA Pay + UI
 */

export enum ExecutionPhase {
  ARCHITECTURE_BOOTSTRAP = 1,
  CHAMELEON_SKILLS = 2,
  SECURITY_HARDENING = 3,
  GOOGLE_INTEGRATION = 4,
  GINA_PAY_UI = 5,
}

export interface PhaseConfig {
  phase: ExecutionPhase;
  name: string;
  description: string;
  dependencies: ExecutionPhase[];
  validators: PhaseValidator[];
  rollbackStrategy: RollbackStrategy;
}

export interface PhaseValidator {
  name: string;
  validate: () => Promise<ValidationResult>;
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export enum RollbackStrategy {
  SNAPSHOT = 'snapshot',      // استرجاع من لقطة
  INCREMENTAL = 'incremental', // استرجاع تدريجي
  FULL_RESET = 'full_reset',  // إعادة تعيين كاملة
}

export interface GinaEngineConfig {
  platform: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
  };
  phases: PhaseConfig[];
  security: SecurityConfig;
  google: GoogleIntegrationConfig;
  ginaPay: GinaPayConfig;
}

export interface SecurityConfig {
  encryptionAlgorithm: 'AES-256-GCM' | 'ChaCha20-Poly1305';
  jwtSecret: string;
  jwtExpiresIn: string;
  mfaEnabled: boolean;
  zeroTrustEnabled: boolean;
  auditLogEnabled: boolean;
  rateLimiting: RateLimitConfig;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  blockDuration: number;
}

export interface GoogleIntegrationConfig {
  projectId: string;
  firebase: FirebaseConfig;
  gemini: GeminiConfig;
  cloud: CloudConfig;
  workspace: WorkspaceConfig;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreRegion: string;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  safetySettings: GeminiSafetySettings[];
}

export interface GeminiSafetySettings {
  category: string;
  threshold: string;
}

export interface CloudConfig {
  region: string;
  zone: string;
  serviceAccountKey: string;
}

export interface WorkspaceConfig {
  domain: string;
  adminEmail: string;
  oauthClientId: string;
  oauthClientSecret: string;
}

export interface GinaPayConfig {
  merchantId: string;
  apiKey: string;
  webhookSecret: string;
  currencies: string[];
  supportedMethods: PaymentMethod[];
  complianceRegions: string[];
}

export type PaymentMethod = 
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'crypto'
  | 'mobile_wallet'
  | 'apple_pay'
  | 'google_pay';
