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
import {
  OrdersService,
  CreateOrderDto,
  UpdateOrderDto,
  UpdateOrderStatusDto,
  CreateShipmentDto,
  UpdateShipmentStatusDto,
  UpdateShipmentDto,
  VerifyLiveTrackingUrlDto,
  RecordOrderPaymentDto,
} from './orders.service';

@Controller('orders')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@PageAccess('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
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

  @Get('dispatchable')
  @PageAccess('shipments', 'orders')
  getDispatchableOrders(@CurrentUser() user: ScopedUser) {
    return this.ordersService.getDispatchableOrders(user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id')
  updateOrder(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.ordersService.updateOrder(id, dto, user);
  }

  @Post(':id/payments')
  recordPayment(
    @Param('id') id: string,
    @Body() body: RecordOrderPaymentDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.ordersService.recordPayment(id, body, user);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.ordersService.updateStatus(id, dto, user);
  }

  @Get('shipments/list')
  @PageAccess('shipments')
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
  @PageAccess('shipments')
  createShipment(@Body() dto: CreateShipmentDto, @CurrentUser() user: ScopedUser) {
    return this.ordersService.createShipment(dto, user);
  }

  @Patch('shipments/:id')
  @PageAccess('shipments')
  updateShipment(
    @Param('id') id: string,
    @Body() dto: UpdateShipmentDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.ordersService.updateShipment(id, dto, user);
  }

  @Patch('shipments/:id/status')
  @PageAccess('shipments')
  updateShipmentStatus(
    @Param('id') id: string,
    @Body() body: UpdateShipmentStatusDto,
    @CurrentUser() user: ScopedUser,
  ) {
    return this.ordersService.updateShipmentStatus(id, body.status, user);
  }

  @Post('shipments/verify-live-url')
  @PageAccess('shipments')
  verifyLiveTrackingUrl(@Body() dto: VerifyLiveTrackingUrlDto) {
    return this.ordersService.verifyLiveTrackingUrl(dto);
  }

  @Post('shipments/:id/sync-tracking')
  @PageAccess('shipments')
  syncShipmentTracking(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.ordersService.syncShipmentTracking(id, user);
  }

  @Get('shipments/:id/live-timeline')
  @PageAccess('shipments')
  getShipmentLiveTimeline(@Param('id') id: string, @CurrentUser() user: ScopedUser) {
    return this.ordersService.getShipmentLiveTimeline(id, user);
  }
}
