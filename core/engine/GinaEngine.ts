/**
 * 🧬 GINA AI Core Engine — محرك التنفيذ المركزي
 * الخوارزمية الخماسية: التنفيذ المتسلسل مع إدارة الحالة
 */

import { EventEmitter } from 'events';
import {
  ExecutionPhase,
  GinaEngineConfig,
  PhaseConfig,
  ValidationResult,
} from './types';

export class GinaEngine extends EventEmitter {
  private config: GinaEngineConfig;
  private currentPhase: ExecutionPhase | null = null;
  private phaseResults: Map<ExecutionPhase, ValidationResult> = new Map();
  private executionLog: ExecutionLogEntry[] = [];

  constructor(config: GinaEngineConfig) {
    super();
    this.config = config;
    this.setupEventListeners();
  }

  /**
   * 🚀 تشغيل الخوارزمية الخماسية
   * Five-Phase Execution Algorithm
   */
  async executeAllPhases(): Promise<ExecutionReport> {
    const startTime = Date.now();
    const report: ExecutionReport = {
      success: false,
      phases: [],
      totalDuration: 0,
      errors: [],
    };

    this.emit('engine:start', { timestamp: startTime });

    for (const phase of this.config.phases) {
      try {
        const phaseResult = await this.executePhase(phase);
        report.phases.push(phaseResult);

        if (!phaseResult.success) {
          report.errors.push(`Phase ${phase.phase} failed: ${phaseResult.errors.join(', ')}`);
          await this.handlePhaseFailure(phase);
          break;
        }

        this.emit('phase:complete', { phase: phase.phase, result: phaseResult });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        report.errors.push(`Phase ${phase.phase} threw error: ${errorMessage}`);
        this.emit('phase:error', { phase: phase.phase, error });
        break;
      }
    }

    report.totalDuration = Date.now() - startTime;
    report.success = report.errors.length === 0;
    this.emit('engine:complete', report);

    return report;
  }

  /**
   * ⚙️ تنفيذ مرحلة واحدة
   */
  private async executePhase(phase: PhaseConfig): Promise<PhaseExecutionResult> {
    this.currentPhase = phase.phase;
    const startTime = Date.now();

    this.logEntry({
      phase: phase.phase,
      action: 'start',
      timestamp: new Date().toISOString(),
      message: `Starting Phase ${phase.phase}: ${phase.name}`,
    });

    this.emit('phase:start', { phase: phase.phase, name: phase.name });

    // التحقق من المتطلبات الأساسية
    await this.checkDependencies(phase.dependencies);

    // تشغيل المتحققين
    const validationResults = await Promise.all(
      phase.validators.map(v => v.validate())
    );

    const allPassed = validationResults.every(r => r.passed);
    const errors = validationResults.flatMap(r => r.errors);
    const warnings = validationResults.flatMap(r => r.warnings);

    const result: PhaseExecutionResult = {
      phase: phase.phase,
      name: phase.name,
      success: allPassed,
      duration: Date.now() - startTime,
      errors,
      warnings,
    };

    this.phaseResults.set(phase.phase, { passed: allPassed, errors, warnings });

    this.logEntry({
      phase: phase.phase,
      action: allPassed ? 'success' : 'failure',
      timestamp: new Date().toISOString(),
      message: allPassed
        ? `Phase ${phase.phase} completed successfully`
        : `Phase ${phase.phase} failed with ${errors.length} errors`,
    });

    return result;
  }

  /**
   * 🔍 فحص المتطلبات المسبقة
   */
  private async checkDependencies(dependencies: ExecutionPhase[]): Promise<void> {
    for (const dep of dependencies) {
      const result = this.phaseResults.get(dep);
      if (!result || !result.passed) {
        throw new Error(
          `Dependency Phase ${dep} has not completed successfully`
        );
      }
    }
  }

  /**
   * 🔄 معالجة فشل المرحلة
   */
  private async handlePhaseFailure(phase: PhaseConfig): Promise<void> {
    this.emit('phase:rollback', { phase: phase.phase, strategy: phase.rollbackStrategy });

    switch (phase.rollbackStrategy) {
      case 'snapshot':
        await this.rollbackFromSnapshot(phase.phase);
        break;
      case 'incremental':
        await this.rollbackIncremental(phase.phase);
        break;
      case 'full_reset':
        await this.rollbackFull();
        break;
    }
  }

  private async rollbackFromSnapshot(phase: ExecutionPhase): Promise<void> {
    this.logEntry({
      phase,
      action: 'rollback',
      timestamp: new Date().toISOString(),
      message: `Rolling back Phase ${phase} from snapshot`,
    });
  }

  private async rollbackIncremental(phase: ExecutionPhase): Promise<void> {
    this.logEntry({
      phase,
      action: 'rollback',
      timestamp: new Date().toISOString(),
      message: `Incremental rollback for Phase ${phase}`,
    });
  }

  private async rollbackFull(): Promise<void> {
    this.logEntry({
      phase: this.currentPhase!,
      action: 'rollback',
      timestamp: new Date().toISOString(),
      message: 'Full system reset initiated',
    });
  }

  private setupEventListeners(): void {
    this.on('engine:start', () => console.log('🚀 GINA Engine starting...'));
    this.on('phase:complete', ({ phase }) => console.log(`✅ Phase ${phase} complete`));
    this.on('phase:error', ({ phase, error }) => console.error(`❌ Phase ${phase} error:`, error));
    this.on('engine:complete', (report) => {
      console.log(report.success ? '🎉 All phases completed!' : '⚠️ Engine completed with errors');
    });
  }

  private logEntry(entry: ExecutionLogEntry): void {
    this.executionLog.push(entry);
  }

  getExecutionLog(): ExecutionLogEntry[] {
    return [...this.executionLog];
  }

  getCurrentPhase(): ExecutionPhase | null {
    return this.currentPhase;
  }
}

// ===== Interfaces =====

interface ExecutionLogEntry {
  phase: ExecutionPhase;
  action: 'start' | 'success' | 'failure' | 'rollback';
  timestamp: string;
  message: string;
}

interface PhaseExecutionResult {
  phase: ExecutionPhase;
  name: string;
  success: boolean;
  duration: number;
  errors: string[];
  warnings: string[];
}

interface ExecutionReport {
  success: boolean;
  phases: PhaseExecutionResult[];
  totalDuration: number;
  errors: string[];
}
