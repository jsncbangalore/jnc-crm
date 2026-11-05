import {
  Controller,
  Post,
  Get,
  Query,
  Param,
  Body,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService, RecordPaymentInput } from './payments.service';
import { RecordPaymentDto } from './dto/payment.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { RolesGuard } from '../auth/roles.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  async recordPayment(
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: ScopedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ) {
    if (!dto.idempotencyKey) {
      dto.idempotencyKey = idempotencyKey || xIdempotencyKey;
    }
    return this.paymentsService.record(dto, user);
  }

  @Get('payments/idempotency/:key')
  async checkIdempotency(
    @Param('key') key: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.paymentsService.checkIdempotency(key, user);
  }

  @Get('payments')
  async getPayments(
    @CurrentUser() user: ScopedUser,
    @Query('partyId') partyId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.paymentsService.findAll(user, { partyId, page, limit });
  }

  @Post('payments/:id/reverse')
  @HttpCode(HttpStatus.OK)
  async reversePayment(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.paymentsService.reverse(id, reason || 'User requested reversal', user);
  }

  @Get('documents/:type/:id/related')
  async getRelatedDocuments(
    @Param('type') type: string,
    @Param('id') id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.paymentsService.getRelatedDocuments(type, id, user);
  }

  @Get('customers/:id/account-summary')
  async getCustomerAccountSummary(
    @Param('id') customerId: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.paymentsService.getCustomerAccountSummary(customerId, user);
  }

  @Get('payments/:id/receipt')
  async getPaymentReceipt(
    @Param('id') id: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.paymentsService.getPaymentReceipt(id, user);
  }

  @Post('payments/:id/email')
  @HttpCode(HttpStatus.OK)
  async sendReceiptEmail(
    @Param('id') id: string,
    @Body('recipientEmail') recipientEmail: string,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.paymentsService.sendReceiptEmail(id, recipientEmail, user);
  }

  @Post('payments/:id/refund')
  @HttpCode(HttpStatus.OK)
  async refundAdvance(
    @Param('id') id: string,
    @Body() dto: { amount: number; refundMode?: string; reference?: string; notes?: string },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.paymentsService.refundAdvance(id, dto, user);
  }
}
