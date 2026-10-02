/* --- C2PA CONTENT CREDENTIALS & PROVENANCE NOTICE ---
 * c2pa.action: 'c2pa.created'
 * c2pa.ai_training: 'disallowed'
 * c2pa.do_not_train: true
 * rights: 'All rights reserved by original author. Automated AI scraping without license is prohibited.'
 * ----------------------------------------------------- */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── 1. PUBLIC MASTER ITEM CATALOG (68 Normalized SKUs) ──────────────────────
const MASTER_SKUS = [
  { skuCode: 'ITM-100NF_50V_0805', name: '100nF/50V Capacitor', packageType: '0805', unitPrice: 0.60, category: 'Capacitor', taxRate: 18 },
  { skuCode: 'ITM-10UF_16V_1206', name: '10uF/16V Capacitor', packageType: '1206', unitPrice: 2.00, category: 'Capacitor', taxRate: 18 },
  { skuCode: 'ITM-10PF_0805', name: '10pF Capacitor', packageType: '0805', unitPrice: 0.50, category: 'Capacitor', taxRate: 18 },
  { skuCode: 'ITM-0_47UF_0805', name: '0.47uF Capacitor', packageType: '0805', unitPrice: 0.80, category: 'Capacitor', taxRate: 18 },
  { skuCode: 'ITM-100UF_35V_ELEC_SMD', name: '100uF/35V Elec SMD Capacitor', packageType: 'Elec SMD', unitPrice: 4.50, category: 'Capacitor', taxRate: 18 },
  { skuCode: 'ITM-220PF_0805', name: '220pF Capacitor', packageType: '0805', unitPrice: 0.50, category: 'Capacitor', taxRate: 18 },
  { skuCode: 'ITM-22NF_0805', name: '22nF Capacitor', packageType: '0805', unitPrice: 0.60, category: 'Capacitor', taxRate: 18 },
  { skuCode: 'ITM-HB_LED_1206_GRN', name: 'HB - LED Green', packageType: '1206 - GRN', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-CM_LED_1206_RED', name: 'CM - LED Red', packageType: '1206 - RED', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-RL1_LED_1206_RED', name: 'RL1 - LED Red', packageType: '1206 - RED', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-RL2_LED_1206_RED', name: 'RL2 - LED Red', packageType: '1206 - RED', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-FD_LED_1206_RED', name: 'FD - LED Red', packageType: '1206 - RED', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-IN1_LED_1206_RED', name: 'IN1 - LED Red', packageType: '1206 - RED', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-IN2_LED_1206_RED', name: 'IN2 - LED Red', packageType: '1206 - RED', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-PWR_LED_1206_RED', name: 'PWR - LED Red', packageType: '1206 - RED', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-5V6_ZEENER_SOC80', name: '5V6 Zener Diode', packageType: 'SOC80', unitPrice: 1.20, category: 'Diode', taxRate: 18 },
  { skuCode: 'ITM-SMBJ5CA_SMB', name: 'SMBJ5CA TVS Diode', packageType: 'SMB', unitPrice: 4.50, category: 'Diode', taxRate: 18 },
  { skuCode: 'ITM-SR34_SMB', name: 'SR34 Schottky Diode', packageType: 'SMB', unitPrice: 3.50, category: 'Diode', taxRate: 18 },
  { skuCode: 'ITM-TLP181_SMD04', name: 'TLP181 Optocoupler', packageType: 'SMD04', unitPrice: 9.50, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-COMM_PBT_06', name: 'COMM 6-Pin Connector', packageType: 'PBT-06', unitPrice: 12.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-DEBUG_BH04_MS', name: 'DEBUG 4-Pin Berg Header', packageType: 'BH04-MS', unitPrice: 4.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-PROG_BH04_MS', name: 'PROG 4-Pin Berg Header', packageType: 'BH04-MS', unitPrice: 4.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-INTF_PBT_04', name: 'INTF 4-Pin Connector', packageType: 'PBT-04', unitPrice: 8.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-LEDS_RM06_MS', name: 'LEDs 6-Pin Relimate Header', packageType: 'RM06-MS', unitPrice: 6.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-INPUTS_PBT_04', name: 'INPUTS 4-Pin Connector', packageType: 'PBT-04', unitPrice: 8.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-FIRE_DETECTOR_PBT_02', name: 'FIRE_DETECTOR 2-Pin Connector', packageType: 'PBT-02', unitPrice: 5.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-TERMINATION_BH02_MS', name: 'TERMINATION 2-Pin Header', packageType: 'BH02-MS', unitPrice: 3.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-10UH_PW_IND', name: '10uH Power Inductor', packageType: 'PW IND', unitPrice: 8.50, category: 'Inductor', taxRate: 18 },
  { skuCode: 'ITM-30E_BEED_1206', name: '30E Ferrite Bead', packageType: '1206', unitPrice: 2.00, category: 'Inductor', taxRate: 18 },
  { skuCode: 'ITM-40V_7MM', name: '40V 7mm MOV Varistor', packageType: '7MM', unitPrice: 4.50, category: 'Protection', taxRate: 18 },
  { skuCode: 'ITM-MMBT2222A_SOT23_03PIN', name: 'MMBT2222A NPN Transistor', packageType: 'SOT23 - 03PIN', unitPrice: 2.00, category: 'Transistor', taxRate: 18 },
  { skuCode: 'ITM-HFD27_012_S_DIP_RELAY', name: 'HFD27-012-S 12V DIP Relay', packageType: 'DIP RELAY', unitPrice: 28.00, category: 'Relay', taxRate: 18 },
  { skuCode: 'ITM-10K_0805', name: '10K 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-15K_0805', name: '15K 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-120E_0805', name: '120E 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-2K2_0805', name: '2K2 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-3K3_0805', name: '3K3 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-N_A_OR_820_0805', name: '820E / Zero Ohm Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-20K_0805', name: '20K 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-240E_0805', name: '240E 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-698E_OR_4K7_0805', name: '698E or 4K7 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-4K7_0805', name: '4K7 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-2K26_0805', name: '2K26 1% 0805 Resistor', packageType: '0805', unitPrice: 0.20, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-1K_1W_1_2512_2512', name: '1K 1W 1% 2512 Power Resistor', packageType: '2512', unitPrice: 3.50, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-1K5_0805', name: '1K5 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-100K_0805', name: '100K 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-ADDR_SEL_DIP_SW8', name: '8-Way Address Select DIP Switch', packageType: 'DIP SW8', unitPrice: 14.00, category: 'Switch', taxRate: 18 },
  { skuCode: 'ITM-GND_SMD_PAD', name: 'GND Test Point SMD Pad', packageType: 'SMD PAD', unitPrice: 0.50, category: 'Hardware', taxRate: 18 },
  { skuCode: 'ITM-SN65HVD1785_SN75176_DIP08', name: 'SN65HVD1785 / SN75176 RS485 Transceiver', packageType: 'DIP08', unitPrice: 38.00, category: 'IC & Active', taxRate: 18 },
  { skuCode: 'ITM-R5F104BCA_TQFP32', name: 'R5F104BCA Renesas 16-bit Microcontroller', packageType: 'TQFP32', unitPrice: 285.00, category: 'MCU & IC', taxRate: 18 },
  { skuCode: 'ITM-ULN2003_SOIC14', name: 'ULN2003 Darlington Transistor Array', packageType: 'SOIC14', unitPrice: 14.00, category: 'IC & Active', taxRate: 18 },
  { skuCode: 'ITM-L5973D_SOIC08', name: 'L5973D 2.5A Step Down Regulator', packageType: 'SOIC08', unitPrice: 65.00, category: 'Power IC', taxRate: 18 },
  { skuCode: 'ITM-LM317_D2_PACK', name: 'LM317 Adjustable Linear Regulator', packageType: 'D2-PACK', unitPrice: 22.00, category: 'Power IC', taxRate: 18 },
  { skuCode: 'ITM-PAS_SLAVE_NODE_V60_95_25X50_16', name: 'PAS Slave Node V60 Bare PCB', packageType: '95.25x50.16', unitPrice: 85.00, category: 'PCB & Modules', taxRate: 18 },
  { skuCode: 'ITM-100PF_0805', name: '100pF 0805 Capacitor', packageType: '0805', unitPrice: 0.50, category: 'Capacitor', taxRate: 18 },
  { skuCode: 'ITM-220PF_1206', name: '220pF 1206 Capacitor', packageType: '1206', unitPrice: 0.60, category: 'Capacitor', taxRate: 18 },
  { skuCode: 'ITM-CM_1206_YLW', name: 'CM 1206 Yellow LED', packageType: '1206 - YLW', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-HB_1206_GRN', name: 'HB 1206 Green LED', packageType: '1206 - GRN', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-PWR_1206_RED', name: 'PWR 1206 Red LED', packageType: '1206 - RED', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-RL1_1206_RED', name: 'RL1 1206 Red LED', packageType: '1206 - RED', unitPrice: 0.75, category: 'Opto & LED', taxRate: 18 },
  { skuCode: 'ITM-INPUT_PBT_02', name: 'INPUT 2-Pin PBT Connector', packageType: 'PBT-02', unitPrice: 5.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-LED_RM02_MS', name: 'LED 2-Pin Relimate Connector', packageType: 'RM02-MS', unitPrice: 4.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-RLOP_PBT02_MS', name: 'RLOP 2-Pin Relay Output Header', packageType: 'PBT02-MS', unitPrice: 5.00, category: 'Connector', taxRate: 18 },
  { skuCode: 'ITM-MMBT2222A_SOT_23', name: 'MMBT2222A SOT-23 NPN', packageType: 'SOT-23', unitPrice: 2.00, category: 'Transistor', taxRate: 18 },
  { skuCode: 'ITM-820_0805', name: '820 Ohm 0805 Resistor', packageType: '0805', unitPrice: 0.15, category: 'Resistor', taxRate: 18 },
  { skuCode: 'ITM-SN65HCD1785P_MAX485_DIP08', name: 'SN65HCD1785P / MAX485 DIP08 Transceiver', packageType: 'DIP08', unitPrice: 35.00, category: 'IC & Active', taxRate: 18 },
  { skuCode: 'ITM-PAS_NODE_V40_95_25X50_16', name: 'PAS Node V40 Bare PCB', packageType: '95.25x50.16', unitPrice: 85.00, category: 'PCB & Modules', taxRate: 18 },
];

// ─── 2. PROJECT BOMS & STOCK POSITIONS ───────────────────────────────────────
const BOMS_DATA = [
  // 1. PAS_SLAVE_NODE_V60 - FIRE DETECTOR
  {
    project: 'PAS_SLAVE_NODE_V60 - FIRE DETECTOR',
    batchSize: 50,
    items: [
      { itemCode: 'ITM-100NF_50V_0805', ref: 'C1,C3,C6,C13,C16,C17,C18', partValue: '100nF/50V', package: '0805', unit: 'Nos', bomQty: 7, opening: 500, price: 0.60 },
      { itemCode: 'ITM-10UF_16V_1206', ref: 'C2,C14', partValue: '10uF/16V', package: '1206', unit: 'Nos', bomQty: 2, opening: 200, price: 2.00 },
      { itemCode: 'ITM-10PF_0805', ref: 'C4,C5', partValue: '10pF', package: '0805', unit: 'Nos', bomQty: 0, opening: 100, price: 0.50 },
      { itemCode: 'ITM-0_47UF_0805', ref: 'C7', partValue: '0.47uF', package: '0805', unit: 'Nos', bomQty: 1, opening: 150, price: 0.80 },
      { itemCode: 'ITM-100UF_35V_ELEC_SMD', ref: 'C9,C12,C15', partValue: '100uF/35V', package: 'Elec SMD', unit: 'Nos', bomQty: 3, opening: 250, price: 4.50 },
      { itemCode: 'ITM-220PF_0805', ref: 'C10', partValue: '220pF', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.50 },
      { itemCode: 'ITM-22NF_0805', ref: 'C11', partValue: '22nF', package: '0805', unit: 'Nos', bomQty: 1, opening: 120, price: 0.60 },
      { itemCode: 'ITM-HB_LED_1206_GRN', ref: 'D1', partValue: 'HB - LED', package: '1206 - GRN', unit: 'Nos', bomQty: 1, opening: 300, price: 0.75 },
      { itemCode: 'ITM-CM_LED_1206_RED', ref: 'D2', partValue: 'CM - LED', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 300, price: 0.75 },
      { itemCode: 'ITM-RL1_LED_1206_RED', ref: 'D5', partValue: 'RL1 - LED', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 200, price: 0.75 },
      { itemCode: 'ITM-RL2_LED_1206_RED', ref: 'D6', partValue: 'RL2 - LED', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 200, price: 0.75 },
      { itemCode: 'ITM-FD_LED_1206_RED', ref: 'D7', partValue: 'FD - LED', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 200, price: 0.75 },
      { itemCode: 'ITM-IN1_LED_1206_RED', ref: 'D10', partValue: 'IN1 - LED', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 200, price: 0.75 },
      { itemCode: 'ITM-IN2_LED_1206_RED', ref: 'D11', partValue: 'IN2 - LED', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 200, price: 0.75 },
      { itemCode: 'ITM-PWR_LED_1206_RED', ref: 'D13', partValue: 'PWR - LED', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 300, price: 0.75 },
      { itemCode: 'ITM-5V6_ZEENER_SOC80', ref: 'D14', partValue: '5V6 - Zeener', package: 'SOC80', unit: 'Nos', bomQty: 1, opening: 100, price: 1.20 },
      { itemCode: 'ITM-SMBJ5CA_SMB', ref: 'D3,D4', partValue: 'SMBJ5CA', package: 'SMB', unit: 'Nos', bomQty: 2, opening: 150, price: 4.50 },
      { itemCode: 'ITM-SR34_SMB', ref: 'D8,D9', partValue: 'SR34', package: 'SMB', unit: 'Nos', bomQty: 2, opening: 200, price: 3.50 },
      { itemCode: 'ITM-TLP181_SMD04', ref: 'ISO1,ISO2', partValue: 'TLP181', package: 'SMD04', unit: 'Nos', bomQty: 2, opening: 120, price: 9.50 },
      { itemCode: 'ITM-COMM_PBT_06', ref: 'J1', partValue: 'COMM', package: 'PBT-06', unit: 'Nos', bomQty: 1, opening: 80, price: 12.00 },
      { itemCode: 'ITM-DEBUG_BH04_MS', ref: 'J2', partValue: 'DEBUG', package: 'BH04-MS', unit: 'Nos', bomQty: 0, opening: 50, price: 4.00 },
      { itemCode: 'ITM-PROG_BH04_MS', ref: 'J3', partValue: 'PROG', package: 'BH04-MS', unit: 'Nos', bomQty: 0, opening: 50, price: 4.00 },
      { itemCode: 'ITM-INTF_PBT_04', ref: 'J4', partValue: 'INTF', package: 'PBT-04', unit: 'Nos', bomQty: 1, opening: 60, price: 8.00 },
      { itemCode: 'ITM-LEDS_RM06_MS', ref: 'J5', partValue: 'LEDs', package: 'RM06-MS', unit: 'Nos', bomQty: 1, opening: 60, price: 6.00 },
      { itemCode: 'ITM-INPUTS_PBT_04', ref: 'J6', partValue: 'INPUTS', package: 'PBT-04', unit: 'Nos', bomQty: 1, opening: 60, price: 8.00 },
      { itemCode: 'ITM-FIRE_DETECTOR_PBT_02', ref: 'J7', partValue: 'FIRE_DETECTOR', package: 'PBT-02', unit: 'Nos', bomQty: 1, opening: 70, price: 5.00 },
      { itemCode: 'ITM-TERMINATION_BH02_MS', ref: 'LK1', partValue: 'TERMINATION', package: 'BH02-MS', unit: 'Nos', bomQty: 0, opening: 40, price: 3.00 },
      { itemCode: 'ITM-10UH_PW_IND', ref: 'L1', partValue: '10uH', package: 'PW IND', unit: 'Nos', bomQty: 1, opening: 90, price: 8.50 },
      { itemCode: 'ITM-30E_BEED_1206', ref: 'L2', partValue: '30E - BEED', package: '1206', unit: 'Nos', bomQty: 1, opening: 100, price: 2.00 },
      { itemCode: 'ITM-40V_7MM', ref: 'MOV1', partValue: '40V', package: '7MM', unit: 'Nos', bomQty: 1, opening: 100, price: 4.50 },
      { itemCode: 'ITM-MMBT2222A_SOT23_03PIN', ref: 'Q1', partValue: 'MMBT2222A', package: 'SOT23 - 03PIN', unit: 'Nos', bomQty: 1, opening: 200, price: 2.00 },
      { itemCode: 'ITM-HFD27_012_S_DIP_RELAY', ref: 'RLY1,RLY2', partValue: 'HFD27-012-S', package: 'DIP RELAY', unit: 'Nos', bomQty: 2, opening: 110, price: 28.00 },
      { itemCode: 'ITM-10K_0805', ref: 'R1,R4,R7,R8,R13,R14,R15,R16,R17,R18,R19,R20,R26,R28', partValue: '10K', package: '0805', unit: 'Nos', bomQty: 14, opening: 1500, price: 0.15 },
      { itemCode: 'ITM-15K_0805', ref: 'R2,R9', partValue: '15K', package: '0805', unit: 'Nos', bomQty: 2, opening: 200, price: 0.15 },
      { itemCode: 'ITM-120E_0805', ref: 'R3', partValue: '120E', package: '0805', unit: 'Nos', bomQty: 1, opening: 150, price: 0.15 },
      { itemCode: 'ITM-2K2_0805', ref: 'R5,R6,R12,R37', partValue: '2K2', package: '0805', unit: 'Nos', bomQty: 4, opening: 400, price: 0.15 },
      { itemCode: 'ITM-3K3_0805', ref: 'R10,R11,R23,R24,R25,R27,R29,R39,R40,R43', partValue: '3K3', package: '0805', unit: 'Nos', bomQty: 10, opening: 800, price: 0.15 },
      { itemCode: 'ITM-N_A_OR_820_0805', ref: 'R22', partValue: 'N/A or 820', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.15 },
      { itemCode: 'ITM-20K_0805', ref: 'R32', partValue: '20K', package: '0805', unit: 'Nos', bomQty: 1, opening: 150, price: 0.15 },
      { itemCode: 'ITM-240E_0805', ref: 'R33', partValue: '240E', package: '0805', unit: 'Nos', bomQty: 1, opening: 150, price: 0.15 },
      { itemCode: 'ITM-698E_OR_4K7_0805', ref: 'R34', partValue: '698E or 4K7', package: '0805', unit: 'Nos', bomQty: 1, opening: 150, price: 0.15 },
      { itemCode: 'ITM-4K7_0805', ref: 'R35', partValue: '4K7', package: '0805', unit: 'Nos', bomQty: 1, opening: 150, price: 0.15 },
      { itemCode: 'ITM-2K26_0805', ref: 'R36', partValue: '2K26', package: '0805', unit: 'Nos', bomQty: 1, opening: 150, price: 0.20 },
      { itemCode: 'ITM-1K_1W_1_2512_2512', ref: 'R38', partValue: '1K 1W 1% 2512', package: '2512', unit: 'Nos', bomQty: 1, opening: 80, price: 3.50 },
      { itemCode: 'ITM-1K5_0805', ref: 'R41', partValue: '1K5', package: '0805', unit: 'Nos', bomQty: 1, opening: 120, price: 0.15 },
      { itemCode: 'ITM-100K_0805', ref: 'R42', partValue: '100K', package: '0805', unit: 'Nos', bomQty: 1, opening: 150, price: 0.15 },
      { itemCode: 'ITM-ADDR_SEL_DIP_SW8', ref: 'SW1', partValue: 'ADDR_SEL', package: 'DIP SW8', unit: 'Nos', bomQty: 1, opening: 75, price: 14.00 },
      { itemCode: 'ITM-GND_SMD_PAD', ref: 'TP1', partValue: 'GND', package: 'SMD PAD', unit: 'Nos', bomQty: 0, opening: 100, price: 0.50 },
      { itemCode: 'ITM-SN65HVD1785_SN75176_DIP08', ref: 'U1', partValue: 'SN65HVD1785/SN75176', package: 'DIP08', unit: 'Nos', bomQty: 1, opening: 65, price: 38.00 },
      { itemCode: 'ITM-R5F104BCA_TQFP32', ref: 'U2', partValue: 'R5F104BCA', package: 'TQFP32', unit: 'Nos', bomQty: 1, opening: 55, price: 285.00 },
      { itemCode: 'ITM-ULN2003_SOIC14', ref: 'U3', partValue: 'ULN2003', package: 'SOIC14', unit: 'Nos', bomQty: 1, opening: 90, price: 14.00 },
      { itemCode: 'ITM-L5973D_SOIC08', ref: 'U5', partValue: 'L5973D', package: 'SOIC08', unit: 'Nos', bomQty: 1, opening: 60, price: 65.00 },
      { itemCode: 'ITM-LM317_D2_PACK', ref: 'U6', partValue: 'LM317', package: 'D2-PACK', unit: 'Nos', bomQty: 1, opening: 85, price: 22.00 },
      { itemCode: 'ITM-PAS_SLAVE_NODE_V60_95_25X50_16', ref: 'PCB', partValue: 'PAS_SLAVE_NODE_V60', package: '95.25x50.16', unit: 'Nos', bomQty: 1, opening: 50, price: 85.00 },
    ],
  },

  // 2. SCH_PAS_MAIN_CTRL_V31 (Main Controller)
  {
    project: 'SCH_PAS_MAIN_CTRL_V31',
    batchSize: 50,
    items: [
      { itemCode: 'ITM-BT1_CR2032_3V', ref: 'BT1', partValue: 'CR2032/3V + Holder', package: 'BATT + HOLDER', unit: 'Nos', bomQty: 1, opening: 60, price: 15.00 },
      { itemCode: 'ITM-100NF_50V_0805', ref: 'C1,C3,C4,C6,C8,C10,C12,C17,C19,C21,C23,C25,C27,C28,C31,C32,C35,C36,C40,C42,C50,C51,C53', partValue: '0.1uF / 100nF', package: '0805', unit: 'Nos', bomQty: 23, opening: 2400, price: 0.60 },
      { itemCode: 'ITM-0_47UF_0805', ref: 'C2,C54', partValue: '0.47uF', package: '0805', unit: 'Nos', bomQty: 2, opening: 320, price: 0.80 },
      { itemCode: 'ITM-10UF_16V_1206', ref: 'C5,C20,C22,C49,C52,C55', partValue: '10uF/16V', package: '1206', unit: 'Nos', bomQty: 6, opening: 400, price: 2.00 },
      { itemCode: 'ITM-1000UF_50V_ELEC', ref: 'C16,C24', partValue: '1000uF/50V Elec', package: 'Elec Radial', unit: 'Nos', bomQty: 2, opening: 100, price: 9.50 },
      { itemCode: 'ITM-470UF_35V_ELEC', ref: 'C18,C26', partValue: '470uF/35V Elec', package: 'Elec Radial', unit: 'Nos', bomQty: 2, opening: 100, price: 4.75 },
      { itemCode: 'ITM-DS1307_SOIC08', ref: 'U2', partValue: 'DS1307 Real Time Clock', package: 'SOIC-08', unit: 'Nos', bomQty: 1, opening: 75, price: 22.00 },
      { itemCode: 'ITM-AT24LC256_SOIC08', ref: 'U3', partValue: 'AT24LC256 256K I2C EEPROM', package: 'SOIC-08', unit: 'Nos', bomQty: 1, opening: 50, price: 28.00 },
      { itemCode: 'ITM-LM2576_ADJ_TO260', ref: 'U4', partValue: 'LM2576-ADJ 3A Step Down Reg', package: 'TO-260', unit: 'Nos', bomQty: 1, opening: 50, price: 38.00 },
      { itemCode: 'ITM-LM1117_3V3_TO220', ref: 'U5', partValue: 'LM1117 - 3V3 LDO Reg', package: 'TO-220', unit: 'Nos', bomQty: 1, opening: 50, price: 6.00 },
      { itemCode: 'ITM-LM2576_5V_TO263', ref: 'U7', partValue: 'LM2576-5V 3A Step Down Reg', package: 'TO-263', unit: 'Nos', bomQty: 1, opening: 50, price: 38.00 },
      { itemCode: 'ITM-SN65HVD1785_SN75176_DIP08', ref: 'U8,U11,U13', partValue: 'SN65HVD1785/SN75176', package: 'DIP-08 + BASE', unit: 'Nos', bomQty: 3, opening: 80, price: 24.00 },
      { itemCode: 'ITM-ULN2803_SOIC20', ref: 'U9', partValue: 'ULN2803 8-Channel Driver', package: 'SOIC-20', unit: 'Nos', bomQty: 1, opening: 50, price: 24.00 },
      { itemCode: 'ITM-CD4066BC_SOIC14', ref: 'U10,U12', partValue: 'CD4066BC Quad Bilateral Switch', package: 'SOIC-14', unit: 'Nos', bomQty: 2, opening: 50, price: 12.50 },
      { itemCode: 'ITM-R5F104BCA_TQFP32', ref: 'U15', partValue: 'R5F104BCA Renesas MCU', package: 'TQFP32', unit: 'Nos', bomQty: 1, opening: 50, price: 285.00 },
      { itemCode: 'ITM-DFPLAYER_MODULE', ref: 'U16', partValue: 'DFPlayer Mini MP3 Module', package: 'MODULE', unit: 'Nos', bomQty: 1, opening: 40, price: 125.00 },
      { itemCode: 'ITM-MAX3232_SOIC16', ref: 'U17', partValue: 'MAX3232 RS232 Driver', package: 'SOIC-16', unit: 'Nos', bomQty: 1, opening: 50, price: 26.00 },
      { itemCode: 'ITM-32_768KHZ_CRYSTAL', ref: 'Y1', partValue: '32.768KHz RTC Crystal', package: 'TH Small', unit: 'Nos', bomQty: 1, opening: 50, price: 7.50 },
      { itemCode: 'ITM-16MHZ_CRYSTAL', ref: 'Y2', partValue: '16MHz Main Crystal', package: 'TH HC49S', unit: 'Nos', bomQty: 1, opening: 50, price: 7.50 },
      { itemCode: 'ITM-PAS_MAIN_CTRL_PCB', ref: 'PCB', partValue: 'PAS_MAIN_CTRL_V31 Bare PCB', package: '195.58x140.97', unit: 'Nos', bomQty: 1, opening: 50, price: 165.00 },
    ],
  },

  // 3. PAS_SLAVE_NODE_V50
  {
    project: 'PAS_SLAVE_NODE_V50',
    batchSize: 50,
    items: [
      { itemCode: 'ITM-10PF_0805', ref: 'C1,C3', partValue: '10pF', package: '0805', unit: 'Nos', bomQty: 2, opening: 100, price: 0.50 },
      { itemCode: 'ITM-100NF_50V_0805', ref: 'C2,C7,C9,C11,C14', partValue: '100nF/50V', package: '0805', unit: 'Nos', bomQty: 5, opening: 400, price: 0.60 },
      { itemCode: 'ITM-22NF_0805', ref: 'C4', partValue: '22nF', package: '0805', unit: 'Nos', bomQty: 1, opening: 80, price: 0.60 },
      { itemCode: 'ITM-220PF_0805', ref: 'C5', partValue: '220pF', package: '0805', unit: 'Nos', bomQty: 1, opening: 90, price: 0.50 },
      { itemCode: 'ITM-100UF_35V_ELEC_SMD', ref: 'C6,C12,C13', partValue: '100uF/35V', package: 'Elec SMD', unit: 'Nos', bomQty: 3, opening: 200, price: 4.50 },
      { itemCode: 'ITM-0_47UF_0805', ref: 'C8', partValue: '0.47uF', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.80 },
      { itemCode: 'ITM-10UF_16V_1206', ref: 'C10', partValue: '10uF/16V', package: '1206', unit: 'Nos', bomQty: 1, opening: 150, price: 2.00 },
      { itemCode: 'ITM-CM_1206_YLW', ref: 'D1', partValue: 'CM', package: '1206 - YLW', unit: 'Nos', bomQty: 1, opening: 250, price: 0.75 },
      { itemCode: 'ITM-SMBJ8CA_SMB', ref: 'D2,D4', partValue: 'SMBJ8CA', package: 'SMB', unit: 'Nos', bomQty: 2, opening: 100, price: 4.50 },
      { itemCode: 'ITM-HB_1206_GRN', ref: 'D3', partValue: 'HB', package: '1206 - GRN', unit: 'Nos', bomQty: 1, opening: 250, price: 0.75 },
      { itemCode: 'ITM-PWR_1206_RED', ref: 'D5', partValue: 'PWR', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 250, price: 0.75 },
      { itemCode: 'ITM-SR34_SMB', ref: 'D6,D8,D9', partValue: 'SR34', package: 'SMB', unit: 'Nos', bomQty: 3, opening: 180, price: 3.50 },
      { itemCode: 'ITM-RL1_1206_RED', ref: 'D7', partValue: 'RL1', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 250, price: 0.75 },
      { itemCode: 'ITM-COMM_PBT_06', ref: 'J1', partValue: 'RLOP', package: 'PBT-06', unit: 'Nos', bomQty: 1, opening: 75, price: 12.00 },
      { itemCode: 'ITM-INPUT_PBT_02', ref: 'J2', partValue: 'INPUT', package: 'PBT-02', unit: 'Nos', bomQty: 1, opening: 80, price: 5.00 },
      { itemCode: 'ITM-LED_RM02_MS', ref: 'J3', partValue: 'LED', package: 'RM02-MS', unit: 'Nos', bomQty: 1, opening: 70, price: 4.00 },
      { itemCode: 'ITM-DEBUG_BH04_MS', ref: 'J4', partValue: 'DEBUG', package: 'BH04-MS', unit: 'Nos', bomQty: 1, opening: 50, price: 4.00 },
      { itemCode: 'ITM-PROG_BH04_MS', ref: 'J6', partValue: 'PROG', package: 'BH04-MS', unit: 'Nos', bomQty: 1, opening: 50, price: 4.00 },
      { itemCode: 'ITM-10UH_PW_IND', ref: 'L1', partValue: '10uH', package: 'PW IND', unit: 'Nos', bomQty: 1, opening: 85, price: 8.50 },
      { itemCode: 'ITM-MMBT2222A_SOT_23', ref: 'Q1', partValue: 'MMBT2222A', package: 'SOT-23', unit: 'Nos', bomQty: 1, opening: 200, price: 2.00 },
      { itemCode: 'ITM-HFD27_012_S_DIP_RELAY', ref: 'RLY1', partValue: 'HFD27-012-S', package: 'DIP RELAY', unit: 'Nos', bomQty: 1, opening: 90, price: 28.00 },
      { itemCode: 'ITM-2K2_0805', ref: 'R1,R2,R13,R15,R23', partValue: '2K2', package: '0805', unit: 'Nos', bomQty: 5, opening: 450, price: 0.15 },
      { itemCode: 'ITM-10K_0805', ref: 'R4,R5,R6,R7,R8,R9,R10,R11,R12,R16,R18,R22,R25,R26', partValue: '10K', package: '0805', unit: 'Nos', bomQty: 14, opening: 1200, price: 0.15 },
      { itemCode: 'ITM-SN65HVD1785_SN75176_DIP08', ref: 'U1', partValue: 'SN65HVD1785/SN75176', package: 'DIP08', unit: 'Nos', bomQty: 1, opening: 60, price: 38.00 },
      { itemCode: 'ITM-R5F104BCA_TQFP32', ref: 'U2', partValue: 'R5F104BCA', package: 'TQFP32', unit: 'Nos', bomQty: 1, opening: 55, price: 285.00 },
      { itemCode: 'ITM-L5973D_SOIC08', ref: 'U3', partValue: 'L5973D', package: 'SOIC08', unit: 'Nos', bomQty: 1, opening: 65, price: 65.00 },
      { itemCode: 'ITM-LM317_D2_PACK', ref: 'U4', partValue: 'LM317', package: 'D2-PACK', unit: 'Nos', bomQty: 1, opening: 80, price: 22.00 },
      { itemCode: 'ITM-PAS_SLAVE_NODE_V50_PCB', ref: 'PCB', partValue: 'PAS_SLAVE_NODE_V50', package: '95.25x50.16', unit: 'Nos', bomQty: 1, opening: 50, price: 85.00 },
    ],
  },

  // 4. PAS_NODE_V40
  {
    project: 'PAS_NODE_V40',
    batchSize: 50,
    items: [
      { itemCode: 'ITM-100PF_0805', ref: 'C1,C3', partValue: '100pF', package: '0805', unit: 'Nos', bomQty: 2, opening: 100, price: 0.50 },
      { itemCode: 'ITM-100NF_50V_0805', ref: 'C2,C7,C9,C11,C14', partValue: '100nF/50V', package: '0805', unit: 'Nos', bomQty: 5, opening: 350, price: 0.60 },
      { itemCode: 'ITM-22NF_0805', ref: 'C4', partValue: '22nF', package: '0805', unit: 'Nos', bomQty: 1, opening: 80, price: 0.60 },
      { itemCode: 'ITM-220PF_1206', ref: 'C5', partValue: '220pF', package: '1206', unit: 'Nos', bomQty: 1, opening: 80, price: 0.60 },
      { itemCode: 'ITM-100UF_35V_ELEC_SMD', ref: 'C6,C12,C13', partValue: '100uF/35V', package: 'Elec SMD', unit: 'Nos', bomQty: 3, opening: 180, price: 4.50 },
      { itemCode: 'ITM-0_47UF_0805', ref: 'C8', partValue: '0.47uF', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.80 },
      { itemCode: 'ITM-10UF_16V_1206', ref: 'C10', partValue: '10uF/16V', package: '1206', unit: 'Nos', bomQty: 1, opening: 140, price: 2.00 },
      { itemCode: 'ITM-CM_1206_YLW', ref: 'D1', partValue: 'CM', package: '1206 - YLW', unit: 'Nos', bomQty: 1, opening: 200, price: 0.75 },
      { itemCode: 'ITM-SMBJ5CA_SMB', ref: 'D2,D4', partValue: 'SMBJ5CA', package: 'SMB', unit: 'Nos', bomQty: 2, opening: 100, price: 4.50 },
      { itemCode: 'ITM-HB_1206_GRN', ref: 'D3', partValue: 'HB', package: '1206 - GRN', unit: 'Nos', bomQty: 1, opening: 200, price: 0.75 },
      { itemCode: 'ITM-PWR_1206_RED', ref: 'D5', partValue: 'PWR', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 200, price: 0.75 },
      { itemCode: 'ITM-SR34_SMB', ref: 'D6,D8,D9', partValue: 'SR34', package: 'SMB', unit: 'Nos', bomQty: 3, opening: 150, price: 3.50 },
      { itemCode: 'ITM-RL1_1206_RED', ref: 'D7', partValue: 'RL1', package: '1206 - RED', unit: 'Nos', bomQty: 1, opening: 200, price: 0.75 },
      { itemCode: 'ITM-COMM_PBT_06', ref: 'J1', partValue: 'COMM', package: 'PBT-06', unit: 'Nos', bomQty: 1, opening: 70, price: 12.00 },
      { itemCode: 'ITM-INPUT_PBT_02', ref: 'J2', partValue: 'INPUT', package: 'PBT-02', unit: 'Nos', bomQty: 1, opening: 80, price: 5.00 },
      { itemCode: 'ITM-LED_RM02_MS', ref: 'J3', partValue: 'LED', package: 'RM02-MS', unit: 'Nos', bomQty: 1, opening: 70, price: 4.00 },
      { itemCode: 'ITM-RLOP_PBT02_MS', ref: 'J5', partValue: 'RLOP', package: 'PBT02-MS', unit: 'Nos', bomQty: 1, opening: 60, price: 5.00 },
      { itemCode: 'ITM-10UH_PW_IND', ref: 'L1', partValue: '10uH', package: 'PW IND', unit: 'Nos', bomQty: 1, opening: 80, price: 8.50 },
      { itemCode: 'ITM-MMBT2222A_SOT_23', ref: 'Q1', partValue: 'MMBT2222A', package: 'SOT-23', unit: 'Nos', bomQty: 1, opening: 200, price: 2.00 },
      { itemCode: 'ITM-HFD27_012_S_DIP_RELAY', ref: 'RLY1', partValue: 'HFD27-012-S', package: 'DIP RELAY', unit: 'Nos', bomQty: 1, opening: 90, price: 28.00 },
      { itemCode: 'ITM-2K2_0805', ref: 'R1,R2,R13,R15,R23', partValue: '2K2', package: '0805', unit: 'Nos', bomQty: 5, opening: 400, price: 0.15 },
      { itemCode: 'ITM-15K_0805', ref: 'R3,R17', partValue: '15K', package: '0805', unit: 'Nos', bomQty: 2, opening: 180, price: 0.15 },
      { itemCode: 'ITM-10K_0805', ref: 'R4,R5,R6,R7,R8,R9,R10,R11,R12,R16,R18,R22,R25,R26', partValue: '10K', package: '0805', unit: 'Nos', bomQty: 14, opening: 1100, price: 0.15 },
      { itemCode: 'ITM-120E_0805', ref: 'R14', partValue: '120E', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.15 },
      { itemCode: 'ITM-3K3_0805', ref: 'R19', partValue: '3K3', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.15 },
      { itemCode: 'ITM-4K7_0805', ref: 'R20,R27', partValue: '4K7', package: '0805', unit: 'Nos', bomQty: 2, opening: 150, price: 0.15 },
      { itemCode: 'ITM-2K26_0805', ref: 'R21', partValue: '2K26', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.20 },
      { itemCode: 'ITM-20K_0805', ref: 'R24', partValue: '20K', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.15 },
      { itemCode: 'ITM-820_0805', ref: 'R28', partValue: '820', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.15 },
      { itemCode: 'ITM-240E_0805', ref: 'R29', partValue: '240E', package: '0805', unit: 'Nos', bomQty: 1, opening: 100, price: 0.15 },
      { itemCode: 'ITM-ADDR_SEL_DIP_SW8', ref: 'SW1', partValue: 'ADDR_SEL', package: 'DIP SW8', unit: 'Nos', bomQty: 1, opening: 70, price: 14.00 },
      { itemCode: 'ITM-SN65HCD1785P_MAX485_DIP08', ref: 'U1', partValue: 'SN65HCD1785P / MAX485', package: 'DIP08', unit: 'Nos', bomQty: 1, opening: 60, price: 35.00 },
      { itemCode: 'ITM-R5F104BCA_TQFP32', ref: 'U2', partValue: 'R5F104BCA', package: 'TQFP32', unit: 'Nos', bomQty: 1, opening: 55, price: 285.00 },
      { itemCode: 'ITM-L5973D_SOIC08', ref: 'U3', partValue: 'L5973D', package: 'SOIC08', unit: 'Nos', bomQty: 1, opening: 60, price: 65.00 },
      { itemCode: 'ITM-LM317_D2_PACK', ref: 'U4', partValue: 'LM317', package: 'D2-PACK', unit: 'Nos', bomQty: 1, opening: 75, price: 22.00 },
      { itemCode: 'ITM-PAS_NODE_V40_95_25X50_16', ref: 'PCB', partValue: 'PAS_NODE_V40', package: '95.25x50.16', unit: 'Nos', bomQty: 1, opening: 50, price: 85.00 },
    ],
  },

  // 5. RTC – Controller BOM
  {
    project: 'RTC – Controller BOM',
    batchSize: 25,
    items: [
      { itemCode: 'ITM-100NF_50V_0805', ref: 'C4,C5,C8,C10,C11,C15,C17,C20', partValue: '100nF', package: '1206', unit: 'Nos', bomQty: 8, opening: 200, price: 0.60 },
      { itemCode: 'ITM-220UF_25V_TH', ref: 'C3', partValue: '220uF/25V Electrolytic', package: 'TH', unit: 'Nos', bomQty: 1, opening: 50, price: 3.50 },
      { itemCode: 'ITM-10UF_25V_TH', ref: 'C9,C12,C16,C6,C7', partValue: '10uF/25V Electrolytic', package: 'TH', unit: 'Nos', bomQty: 5, opening: 100, price: 2.00 },
      { itemCode: 'ITM-1000UF_35V_TH', ref: 'C2', partValue: '1000uF/35V Electrolytic', package: 'TH', unit: 'Nos', bomQty: 1, opening: 50, price: 8.50 },
      { itemCode: 'ITM-10K_1206', ref: 'R5,R15', partValue: '10K 5%', package: '1206', unit: 'Nos', bomQty: 2, opening: 100, price: 0.20 },
      { itemCode: 'ITM-1K_1206', ref: 'R3,R6,R7', partValue: '1K 5%', package: '1206', unit: 'Nos', bomQty: 3, opening: 150, price: 0.20 },
      { itemCode: 'ITM-LM2576_SMD', ref: 'REG', partValue: 'LM2576 Step Down IC', package: 'SMD', unit: 'Nos', bomQty: 1, opening: 40, price: 38.00 },
      { itemCode: 'ITM-PIC18F46K22_TH_40PIN', ref: 'U1', partValue: '40pin IC Base + 18F46K22 MCU', package: 'TH', unit: 'Nos', bomQty: 1, opening: 35, price: 245.00 },
      { itemCode: 'ITM-ULN2803_TH_18PIN', ref: 'U6', partValue: '18pin IC Base + ULN2803', package: 'TH', unit: 'Nos', bomQty: 1, opening: 50, price: 22.00 },
      { itemCode: 'ITM-CD4094_TH_16PIN', ref: 'U5', partValue: '16pin IC Base + 4094 Shift Reg', package: 'TH', unit: 'Nos', bomQty: 1, opening: 50, price: 18.00 },
      { itemCode: 'ITM-PC817_OPTO_TH', ref: 'ISO1', partValue: 'PC817 Optocoupler', package: 'TH', unit: 'Nos', bomQty: 25, opening: 250, price: 4.50 },
      { itemCode: 'ITM-MP3_MODULE_16GB_SD', ref: 'U4', partValue: 'MP3 Module + 16GB MicroSD Card', package: 'TH', unit: 'Nos', bomQty: 1, opening: 25, price: 350.00 },
      { itemCode: 'ITM-DS3231_RTC_SMD', ref: 'DS3231', partValue: 'DS3231 High Precision RTC IC', package: 'SMD', unit: 'Nos', bomQty: 1, opening: 30, price: 110.00 },
      { itemCode: 'ITM-12V_RELAY_20NOS', ref: 'RL1 to RL20', partValue: '+12V Relay', package: 'TH Sugar Cube', unit: 'Nos', bomQty: 20, opening: 100, price: 18.00 },
    ],
  },

  // 6. PAS – MASTER CPU BOM
  {
    project: 'PAS – MASTER CPU BOM',
    batchSize: 20,
    items: [
      { itemCode: 'ITM-100NF_50V_0805', ref: 'C3,C4,C6,C8,C10,C11,C12,C13,C14', partValue: '100nF/50V', package: '1206', unit: 'Nos', bomQty: 9, opening: 200, price: 0.60 },
      { itemCode: 'ITM-PIC18F25K22_TH_28PIN', ref: 'U1', partValue: '28pin IC Base + PIC18F25K22 MCU', package: 'TH', unit: 'Nos', bomQty: 1, opening: 25, price: 210.00 },
      { itemCode: 'ITM-DS3695_RS485_TH', ref: 'U2', partValue: '8pin IC Base + DS3695', package: 'TH', unit: 'Nos', bomQty: 1, opening: 30, price: 45.00 },
      { itemCode: 'ITM-AUDIO_TRANSFORMER', ref: 'T1,T2', partValue: 'Audio Isolation Transformer', package: 'TH', unit: 'Nos', bomQty: 2, opening: 40, price: 85.00 },
      { itemCode: 'ITM-RELAY_DPDT_5A', ref: 'LS1 to LS10', partValue: 'RELAY DPDT - 5A', package: 'TH', unit: 'Nos', bomQty: 10, opening: 80, price: 32.00 },
      { itemCode: 'ITM-RELAY_DPDT_1A', ref: 'LS11 to LS15', partValue: 'RELAY DPDT - 1A', package: 'TH', unit: 'Nos', bomQty: 5, opening: 60, price: 26.00 },
    ],
  },

  // 7. 20IO – Controller BOM
  {
    project: '20IO – Controller BOM',
    batchSize: 20,
    items: [
      { itemCode: 'ITM-100NF_50V_0805', ref: 'C4,C10,C11,C15,C17,C18,C19,C20,C21,C22,C23,C24,C25', partValue: '100nF', package: '1206', unit: 'Nos', bomQty: 13, opening: 300, price: 0.60 },
      { itemCode: 'ITM-PIC18F46K22_TH_40PIN', ref: 'U1', partValue: '40pin IC Base + 18F46K22', package: 'TH', unit: 'Nos', bomQty: 1, opening: 25, price: 245.00 },
      { itemCode: 'ITM-ULN2803_TH_18PIN', ref: 'U6,U8,U10', partValue: '18pin IC Base + ULN2803', package: 'TH', unit: 'Nos', bomQty: 3, opening: 60, price: 22.00 },
      { itemCode: 'ITM-CD4094_TH_16PIN', ref: 'U5,U7,U9', partValue: '16pin IC Base + 4094', package: 'TH', unit: 'Nos', bomQty: 3, opening: 60, price: 18.00 },
      { itemCode: 'ITM-74HC245N_TI_TH_20PIN', ref: 'U11,U12,U13', partValue: '20pin IC Base + 74HC245N (TI make)', package: 'TH', unit: 'Nos', bomQty: 3, opening: 50, price: 28.00 },
      { itemCode: 'ITM-PC817_OPTO_TH', ref: 'ISO1 to ISO25', partValue: 'PC817 Optocoupler', package: 'TH', unit: 'Nos', bomQty: 25, opening: 250, price: 4.50 },
    ],
  },

  // 8. 24IO – Controller BOM
  {
    project: '24IO – Controller BOM',
    batchSize: 20,
    items: [
      { itemCode: 'ITM-100NF_50V_0805', ref: 'C3,C5,C6,C8,C9,C11,C12,C13,C14,C15,C16,C17,C18,C19', partValue: '100nF', package: '1206', unit: 'Nos', bomQty: 13, opening: 300, price: 0.60 },
      { itemCode: 'ITM-PIC18F46K22_TH_40PIN', ref: 'U1', partValue: '40pin IC Base + 18F46K22', package: 'TH', unit: 'Nos', bomQty: 1, opening: 25, price: 245.00 },
      { itemCode: 'ITM-ULN2803_TH_18PIN', ref: 'U5,U7,U9', partValue: '18pin IC Base + ULN2803', package: 'TH', unit: 'Nos', bomQty: 3, opening: 60, price: 22.00 },
      { itemCode: 'ITM-CD4094_TH_16PIN', ref: 'U4,U6,U8', partValue: '16pin IC Base + 4094', package: 'TH', unit: 'Nos', bomQty: 3, opening: 60, price: 18.00 },
      { itemCode: 'ITM-74HC245N_TI_TH_20PIN', ref: 'U10,U11,U12', partValue: '20pin IC Base + 74HC245N (TI)', package: 'TH', unit: 'Nos', bomQty: 3, opening: 50, price: 28.00 },
      { itemCode: 'ITM-PC817_OPTO_TH', ref: 'ISO1 to ISO25', partValue: 'PC817 Optocoupler', package: 'TH', unit: 'Nos', bomQty: 25, opening: 250, price: 4.50 },
      { itemCode: 'ITM-12V_RELAY_20NOS', ref: 'RL1 to RL20', partValue: '+12V Relay', package: 'TH Sugar Cube', unit: 'Nos', bomQty: 20, opening: 100, price: 18.00 },
    ],
  },

  // 9. 12/16IO – Controller BOM
  {
    project: '12/16IO – Controller BOM',
    batchSize: 20,
    items: [
      { itemCode: 'ITM-100NF_50V_0805', ref: 'C3,C4,C6,C7,C9,C10,C11,C12,C13,C14', partValue: '100nF', package: '1206', unit: 'Nos', bomQty: 10, opening: 250, price: 0.60 },
      { itemCode: 'ITM-PIC18F25K22_TH_28PIN', ref: 'U1', partValue: '28pin IC Base + 18F25K22', package: 'TH', unit: 'Nos', bomQty: 1, opening: 25, price: 210.00 },
      { itemCode: 'ITM-ULN2803_TH_18PIN', ref: 'U7,U9', partValue: '18pin IC Base + ULN2803', package: 'TH', unit: 'Nos', bomQty: 2, opening: 40, price: 22.00 },
      { itemCode: 'ITM-CD4094_TH_16PIN', ref: 'U6,U8', partValue: '16pin IC Base + 4094', package: 'TH', unit: 'Nos', bomQty: 2, opening: 40, price: 18.00 },
      { itemCode: 'ITM-74HC245N_TI_TH_20PIN', ref: 'U4,U5', partValue: '20pin IC Base + 74HC245N (TI)', package: 'TH', unit: 'Nos', bomQty: 2, opening: 40, price: 28.00 },
      { itemCode: 'ITM-PC817_OPTO_TH', ref: 'ISO1 to ISO17', partValue: 'PC817', package: 'TH', unit: 'Nos', bomQty: 17, opening: 170, price: 4.50 },
      { itemCode: 'ITM-MAX485_DIP08', ref: 'U2', partValue: '8pin IC Base + MAX485', package: 'TH', unit: 'Nos', bomQty: 1, opening: 40, price: 25.00 },
      { itemCode: 'ITM-12V_RELAY_16NOS', ref: 'LS1 to LS16', partValue: '+12V Relay', package: 'TH', unit: 'Nos', bomQty: 16, opening: 80, price: 18.00 },
    ],
  },
];

async function main() {
  console.log('Starting JNC Master Catalog & Project BOMs Ingestion...');

  const jncTenant = (await prisma.tenant.findFirst({
    where: { OR: [{ code: 'JNC' }, { code: 'JNC-ORG-001' }] },
  })) || (await prisma.tenant.create({
    data: {
      code: 'JNC',
      name: 'JS Network Communication',
      slug: 'jnc',
      status: 'active',
      plan: 'enterprise',
      maxUsers: 50,
      currency: 'INR',
    },
  }));
  const defaultTenantId = jncTenant.id;

  // 1. Ensure Default Warehouse exists
  let warehouse = await prisma.warehouse.findFirst({ where: { code: 'BLR-MAIN' } });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        code: 'BLR-MAIN',
        name: 'Bengaluru Electronics Assembly Warehouse',
        city: 'Bengaluru',
      },
    });
  }

  // 2. Ensure Default Supplier exists
  let supplier = await prisma.supplier.findFirst({ where: { name: 'JNC Component Sourcing & Ahuja Electronics' } });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        name: 'JNC Component Sourcing & Ahuja Electronics',
        contactPerson: 'Procurement Head',
        email: 'purchase@jncsystems.in',
        phone: '+91 98450 12345',
        leadTimeDays: 5,
        isActive: true,
      },
    });
  }

  // 3. Upsert All 68 Master SKUs
  console.log(`📦 Upserting ${MASTER_SKUS.length} Master Normalized SKUs...`);
  let skuCount = 0;
  for (const s of MASTER_SKUS) {
    await prisma.sku.upsert({
      where: {
        tenantId_skuCode: {
          tenantId: defaultTenantId,
          skuCode: s.skuCode,
        },
      },
      update: {
        name: s.name,
        packageType: s.packageType,
        unitPrice: s.unitPrice,
        costPrice: s.unitPrice,
        taxRate: s.taxRate,
        category: s.category,
        preferredSupplierId: supplier.id,
      },
      create: {
        tenantId: defaultTenantId,
        skuCode: s.skuCode,
        name: s.name,
        packageType: s.packageType,
        unitPrice: s.unitPrice,
        costPrice: s.unitPrice,
        taxRate: s.taxRate,
        category: s.category,
        preferredSupplierId: supplier.id,
        reorderPoint: 10,
        reorderQty: 50,
      },
    });
    skuCount++;
  }
  console.log(`✅ Successfully loaded ${skuCount} Master SKUs into Catalog.`);

  // 4. Ingest All 9 Project BOMs into ProjectStockPosition
  console.log(`🔧 Ingesting 9 Project BOMs and Component Stock Positions...`);
  let bomItemCount = 0;

  for (const bom of BOMS_DATA) {
    for (const item of bom.items) {
      // Ensure SKU exists for this item
      let sku = await prisma.sku.findFirst({
        where: { skuCode: item.itemCode, tenantId: defaultTenantId },
      });
      if (!sku) {
        sku = await prisma.sku.create({
          data: {
            skuCode: item.itemCode,
            name: item.partValue,
            packageType: item.package,
            unitPrice: item.price || 5.00,
            costPrice: item.price || 5.00,
            taxRate: 18.0,
            category: bom.project.split(' ')[0] || 'PA System',
            preferredSupplierId: supplier.id,
            reorderPoint: 10,
            reorderQty: 50,
          },
        });
      }

      // Upsert Stock Item for Warehouse
      const existingStockItem = await prisma.stockItem.findFirst({
        where: { skuId: sku.id, warehouseId: warehouse.id },
      });
      if (!existingStockItem) {
        await prisma.stockItem.create({
          data: {
            skuId: sku.id,
            warehouseId: warehouse.id,
            quantityOnHand: item.opening || 50,
            quantityReserved: 0,
          },
        });
      }

      // Upsert ProjectStockPosition
      const plannedReq = item.bomQty * bom.batchSize;
      const presentStock = item.opening || 0;
      const shortage = Math.max(0, plannedReq - presentStock);
      const status = shortage > 0 ? (shortage > plannedReq * 0.5 ? 'Critical Shortage' : 'Shortage') : 'Sufficient';

      const existingPos = await prisma.projectStockPosition.findFirst({
        where: {
          project: bom.project,
          itemCode: item.itemCode,
        },
      });

      if (existingPos) {
        await prisma.projectStockPosition.update({
          where: { id: existingPos.id },
          data: {
            reference: item.ref,
            partValue: item.partValue,
            package: item.package,
            unit: item.unit,
            bomQtyPerUnit: item.bomQty,
            batchQty: bom.batchSize,
            plannedRequirement: plannedReq,
            openingStock: item.opening,
            presentStock: presentStock,
            shortage: shortage,
            status: status,
            notes: `Designator: ${item.ref} | Package: ${item.package}`,
          },
        });
      } else {
        await prisma.projectStockPosition.create({
          data: {
            project: bom.project,
            reference: item.ref,
            quantity: item.bomQty,
            itemCode: item.itemCode,
            partValue: item.partValue,
            package: item.package,
            unit: item.unit,
            bomQtyPerUnit: item.bomQty,
            batchQty: bom.batchSize,
            plannedRequirement: plannedReq,
            openingStock: item.opening,
            inflow: 0,
            outflow: 0,
            presentStock: presentStock,
            shortage: shortage,
            status: status,
            notes: `Designator: ${item.ref} | Package: ${item.package}`,
          },
        });
      }

      bomItemCount++;
    }
  }

  console.log(`🎉 Ingestion Complete! Loaded ${bomItemCount} components across 9 Project BOMs!`);
}

main()
  .catch((e) => {
    console.error('❌ Ingestion Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
