import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VideoDubbingController } from './video-dubbing.controller';
import { VideoDubbingService } from './video-dubbing.service';
import { VideoDubbingProcessor } from './video-dubbing.processor';
import { VideoDownloaderEngine } from './engines/video-downloader.engine';
import { AudioProcessorEngine } from './engines/audio-processor.engine';
import { WhisperEngine } from './engines/whisper.engine';
import { TTSEngine } from './engines/tts.engine';
import { VideoEncoderEngine } from './engines/video-encoder.engine';
import { DatabaseModule } from '@db/database.module';
import { S3Module } from '@utils/s3/s3.module';
import { TranslationModule } from '@modules/translation/translation.module';
import { RedisModule } from '@utils/redis/redis.module';

@Module({
  imports: [
    DatabaseModule,
    S3Module,
    TranslationModule,
    RedisModule,
    BullModule.registerQueue({
      name: 'video-dubbing',
    }),
  ],
  controllers: [VideoDubbingController],
  providers: [
    VideoDubbingService,
    VideoDubbingProcessor,
    VideoDownloaderEngine,
    AudioProcessorEngine,
    WhisperEngine,
    TTSEngine,
    VideoEncoderEngine,
  ],
  exports: [VideoDubbingService],
})
export class VideoDubbingModule {}
