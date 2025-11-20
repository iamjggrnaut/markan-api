import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AITask, AITaskStatus } from './ai-task.entity';
import { RecommendationType } from './ai-recommendation.entity';
import { AIService } from './ai.service';

interface AITaskData {
  taskId: string;
  type: string;
  inputParams: any;
  productId?: string;
  userId: string;
  organizationId?: string | null;
}

@Processor('ai')
@Injectable()
export class AIProcessor {
  private readonly logger = new Logger(AIProcessor.name);

  constructor(
    @InjectRepository(AITask)
    private aiTasksRepository: Repository<AITask>,
    private aiService: AIService,
  ) {}

  @Process('process-ai-task')
  async handleAITask(job: Job<AITaskData>) {
    const { taskId, type, inputParams, productId } = job.data;

    this.logger.log(`Processing AI task ${taskId}, type: ${type}`);

    const task = await this.aiTasksRepository.findOne({
      where: { id: taskId },
    });

    if (!task) {
      this.logger.error(`AI task ${taskId} not found`);
      return;
    }

    task.status = AITaskStatus.PROCESSING;
    task.startedAt = new Date();
    task.progress = 10;
    await this.aiTasksRepository.save(task);

    try {
      let result: any;

      switch (type) {
        case 'demand_forecast':
          if (!productId) {
            throw new Error('Product ID is required for demand forecast');
          }
          result = await this.aiService.getDemandForecast(
            job.data.userId,
            job.data.organizationId,
            productId,
            inputParams.days || 30,
          );
          break;

        case 'price_recommendation':
          if (!productId) {
            throw new Error('Product ID is required for price recommendation');
          }
          result = await this.aiService.getPriceRecommendation(
            job.data.userId,
            job.data.organizationId,
            productId,
          );
          break;

        case 'anomaly_detection':
          result = await this.aiService.detectAnomalies(
            job.data.userId,
            job.data.organizationId,
            inputParams.startDate
              ? new Date(inputParams.startDate)
              : undefined,
            inputParams.endDate ? new Date(inputParams.endDate) : undefined,
          );
          break;

        case 'assortment_expansion':
          result = await this.aiService.getAssortmentRecommendations(
            job.data.userId,
            job.data.organizationId,
          );
          break;

        case 'customer_segmentation':
          result = await this.aiService.getCustomerSegmentation(
            job.data.userId,
            job.data.organizationId,
          );
          break;

        default:
          throw new Error(`Unknown AI task type: ${type}`);
      }

      task.status = AITaskStatus.COMPLETED;
      task.result = result;
      task.progress = 100;
      task.completedAt = new Date();

      // Сохраняем рекомендацию, если это рекомендация
      if (type === 'price_recommendation' && result) {
        await this.aiService.saveRecommendation(
          job.data.userId,
          job.data.organizationId,
          RecommendationType.PRICE,
          `Рекомендация по цене: ${result.productName}`,
          result.reasoning,
          result,
          productId,
          result.confidence,
        );
      }

      await this.aiTasksRepository.save(task);
      this.logger.log(`AI task ${taskId} completed successfully`);
    } catch (error) {
      this.logger.error(`AI task ${taskId} failed: ${error.message}`, error.stack);

      task.status = AITaskStatus.FAILED;
      task.error = error.message;
      task.completedAt = new Date();
      await this.aiTasksRepository.save(task);

      throw error;
    }
  }
}

