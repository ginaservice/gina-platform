/**
 * 🦎 Chameleon Skills System — نظام المهارات الحربائية
 * 
 * نظام تكيفي متعدد الطبقات يمكّن المنصة من:
 * - التكيف السياقي الديناميكي
 * - تعلم الأنماط وتطويرها
 * - التحول التلقائي بين الأوضاع
 * - الاستجابة الذكية للبيئة
 */

import { EventEmitter } from 'events';

// ===== Core Types =====

export enum SkillMode {
  STEALTH = 'stealth',          // وضع التخفي
  AGGRESSIVE = 'aggressive',    // وضع التهجم
  DEFENSIVE = 'defensive',      // وضع الدفاع
  LEARNING = 'learning',        // وضع التعلم
  EXECUTION = 'execution',      // وضع التنفيذ
}

export enum SkillCategory {
  COGNITIVE = 'cognitive',      // المهارات المعرفية
  ADAPTIVE = 'adaptive',        // المهارات التكيفية
  SECURITY = 'security',        // مهارات الأمان
  INTEGRATION = 'integration',  // مهارات التكامل
  PAYMENT = 'payment',          // مهارات الدفع
}

export interface Skill {
  id: string;
  name: string;
  version: string;
  category: SkillCategory;
  mode: SkillMode;
  priority: number;             // 1-100
  contextTriggers: ContextTrigger[];
  execute: (context: SkillContext) => Promise<SkillResult>;
  adapt: (feedback: SkillFeedback) => Promise<void>;
  morphTo: (targetMode: SkillMode) => Promise<Skill>;
}

export interface ContextTrigger {
  type: 'keyword' | 'pattern' | 'state' | 'event';
  value: string | RegExp;
  weight: number;
}

export interface SkillContext {
  sessionId: string;
  userId: string;
  timestamp: number;
  environment: 'web' | 'mobile' | 'api' | 'dashboard';
  language: string;
  userIntent: string;
  previousSkills: string[];
  metadata: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  skillId: string;
  output: unknown;
  confidence: number;           // 0.0 - 1.0
  nextSkills: string[];         // المهارات المقترحة التالية
  adaptationSignals: AdaptationSignal[];
}

export interface SkillFeedback {
  skillId: string;
  rating: number;               // 1-5
  corrections: string[];
  contextUpdate: Partial<SkillContext>;
}

export interface AdaptationSignal {
  type: 'positive' | 'negative' | 'neutral';
  strength: number;
  dimension: string;
}

// ===== Chameleon Engine =====

export class ChameleonSkillsEngine extends EventEmitter {
  private registry: Map<string, Skill> = new Map();
  private activeSkills: Map<string, Skill> = new Map();
  private currentMode: SkillMode = SkillMode.LEARNING;
  private adaptationHistory: AdaptationRecord[] = [];
  private contextMemory: ContextMemory;

  constructor() {
    super();
    this.contextMemory = new ContextMemory(1000); // احتفظ بآخر 1000 سياق
    this.setupDefaultSkills();
  }

  /**
   * 🦎 التحول التلقائي للوضع المناسب
   */
  async morph(context: SkillContext): Promise<SkillMode> {
    const previousMode = this.currentMode;
    const optimalMode = await this.calculateOptimalMode(context);

    if (optimalMode !== previousMode) {
      this.currentMode = optimalMode;
      await this.transitionMode(previousMode, optimalMode);
      this.emit('mode:changed', { from: previousMode, to: optimalMode, context });
    }

    return this.currentMode;
  }

  /**
   * ⚡ تنفيذ المهارة المثلى للسياق
   */
  async executeOptimal(context: SkillContext): Promise<SkillResult> {
    // 1. التحول للوضع المناسب
    await this.morph(context);

    // 2. إيجاد المهارات المطابقة
    const matchedSkills = this.matchSkills(context);

    // 3. ترتيب حسب الأولوية والثقة
    const rankedSkills = this.rankSkills(matchedSkills, context);

    // 4. تنفيذ المهارة الأعلى ترتيباً
    const selectedSkill = rankedSkills[0];
    if (!selectedSkill) {
      throw new Error('No suitable skill found for context');
    }

    const result = await selectedSkill.execute(context);

    // 5. تحديث ذاكرة السياق
    this.contextMemory.store(context, result);

    // 6. بدء التكيف في الخلفية
    this.adaptAsync(selectedSkill, result, context);

    return result;
  }

  /**
   * 📝 تسجيل مهارة جديدة
   */
  registerSkill(skill: Skill): void {
    this.registry.set(skill.id, skill);
    this.emit('skill:registered', { skillId: skill.id, category: skill.category });
  }

  /**
   * 🎯 مطابقة المهارات مع السياق
   */
  private matchSkills(context: SkillContext): Skill[] {
    const matched: Skill[] = [];

    for (const skill of this.registry.values()) {
      let score = 0;

      for (const trigger of skill.contextTriggers) {
        if (this.evaluateTrigger(trigger, context)) {
          score += trigger.weight;
        }
      }

      if (score > 0) {
        matched.push(skill);
      }
    }

    return matched;
  }

  /**
   * 📊 ترتيب المهارات
   */
  private rankSkills(skills: Skill[], context: SkillContext): Skill[] {
    return skills.sort((a, b) => {
      const scoreA = this.calculateSkillScore(a, context);
      const scoreB = this.calculateSkillScore(b, context);
      return scoreB - scoreA;
    });
  }

  private calculateSkillScore(skill: Skill, context: SkillContext): number {
    const priorityWeight = skill.priority * 0.4;
    const modeMatch = skill.mode === this.currentMode ? 30 : 0;
    const historyBonus = this.getHistoryBonus(skill.id, context.userId);
    return priorityWeight + modeMatch + historyBonus;
  }

  private getHistoryBonus(skillId: string, userId: string): number {
    const relevant = this.adaptationHistory.filter(
      r => r.skillId === skillId && r.userId === userId
    );
    if (relevant.length === 0) return 0;
    const avgRating = relevant.reduce((sum, r) => sum + r.rating, 0) / relevant.length;
    return (avgRating / 5) * 30;
  }

  /**
   * 🧮 حساب الوضع الأمثل
   */
  private async calculateOptimalMode(context: SkillContext): Promise<SkillMode> {
    const intent = context.userIntent.toLowerCase();

    if (intent.includes('security') || intent.includes('threat') || intent.includes('attack')) {
      return SkillMode.DEFENSIVE;
    }
    if (intent.includes('learn') || intent.includes('train') || intent.includes('improve')) {
      return SkillMode.LEARNING;
    }
    if (intent.includes('execute') || intent.includes('run') || intent.includes('deploy')) {
      return SkillMode.EXECUTION;
    }
    if (intent.includes('stealth') || intent.includes('hidden') || intent.includes('silent')) {
      return SkillMode.STEALTH;
    }

    return SkillMode.EXECUTION;
  }

  private async transitionMode(from: SkillMode, to: SkillMode): Promise<void> {
    console.log(`🦎 Chameleon morphing: ${from} → ${to}`);
    // تطبيق منطق الانتقال
    for (const skill of this.activeSkills.values()) {
      if (skill.mode !== to) {
        const morphed = await skill.morphTo(to);
        this.activeSkills.set(morphed.id, morphed);
      }
    }
  }

  private evaluateTrigger(trigger: ContextTrigger, context: SkillContext): boolean {
    switch (trigger.type) {
      case 'keyword':
        return context.userIntent.toLowerCase().includes(String(trigger.value).toLowerCase());
      case 'pattern':
        return new RegExp(trigger.value).test(context.userIntent);
      case 'state':
        return this.currentMode === trigger.value;
      default:
        return false;
    }
  }

  private adaptAsync(skill: Skill, result: SkillResult, context: SkillContext): void {
    setImmediate(async () => {
      const feedback: SkillFeedback = {
        skillId: skill.id,
        rating: result.confidence * 5,
        corrections: [],
        contextUpdate: {},
      };
      await skill.adapt(feedback);
      this.adaptationHistory.push({
        skillId: skill.id,
        userId: context.userId,
        rating: feedback.rating,
        timestamp: Date.now(),
      });
    });
  }

  private setupDefaultSkills(): void {
    // المهارات الافتراضية ستُحمَّل من السجل
    console.log('🦎 Chameleon Skills Engine initialized');
  }

  getCurrentMode(): SkillMode {
    return this.currentMode;
  }

  getRegisteredSkillsCount(): number {
    return this.registry.size;
  }
}

// ===== Context Memory =====

class ContextMemory {
  private store: Map<string, { context: SkillContext; result: SkillResult }[]> = new Map();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  store(context: SkillContext, result: SkillResult): void {
    const key = context.userId;
    const existing = this.store.get(key) || [];
    existing.push({ context, result });

    if (existing.length > this.maxSize) {
      existing.shift();
    }

    this.store.set(key, existing);
  }

  retrieve(userId: string, limit = 10): { context: SkillContext; result: SkillResult }[] {
    const history = this.store.get(userId) || [];
    return history.slice(-limit);
  }
}

// ===== Supporting Types =====

interface AdaptationRecord {
  skillId: string;
  userId: string;
  rating: number;
  timestamp: number;
}
