import { Module } from '@nestjs/common';
import { Product1688Service } from './product1688.service';
import { Product1688Controller } from './product1688.controller';
import { DatabaseModule } from '../../db/database.module';
import { TranslationModule } from '../translation/translation.module';

@Module({
  imports: [
    DatabaseModule,
    TranslationModule, // For translation service
  ],
  controllers: [Product1688Controller],
  providers: [Product1688Service],
  exports: [Product1688Service],
})
export class Product1688Module {}
