/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PageAccess } from '../auth/page-access.decorator';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { ScopedUser } from '../auth/scoping.service';
import { OrdersService, CreateOrderDto, UpdateOrderStatusDto, CreateShipmentDto } from './orders.service';

@Controller('orders')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: ScopedUser) {
    return this.ordersService.createOrder(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: ScopedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ordersService.findAll(user, { status, search, page, limit });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  updateOrder(
    @Param('id') id: string,
    @Body() dto: Partial<CreateOrderDto> & { paymentStatus?: string },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.ordersService.updateOrder(id, dto, user);
  }

  @Post(':id/payments')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  recordPayment(
    @Param('id') id: string,
    @Body() body: {
      amount: number;
      paymentType?: string;
      paymentMethod?: string;
      transactionRef?: string;
      paymentDate?: string;
      notes?: string;
    },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.ordersService.recordPayment(id, body, user);
  }

  @Patch(':id/status')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.ordersService.updateStatus(id, dto, user);
  }

  @Get('shipments/list')
  @Roles('tenant_admin', 'admin', 'sub_admin', 'employee')
  listShipments(
    @CurrentUser() user: ScopedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ordersService.listShipments(user, { status, search, page, limit });
  }

  @Post('shipments')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  createShipment(@Body() dto: CreateShipmentDto, @CurrentUser() user: ScopedUser) {
    return this.ordersService.createShipment(dto, user);
  }

  @Patch('shipments/:id/status')
  @Roles('tenant_admin', 'admin', 'sub_admin')
  updateShipmentStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser() user: ScopedUser,
  ) {
    return this.ordersService.updateShipmentStatus(id, body.status, user);
  }
}
