// B-Backend/utils/shippingStatus.js
// Centralized Shipping Status Mapping & Timeline Engine

const SHIPPING_STATUSES = {
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  SHIPMENT_CREATED: 'SHIPMENT_CREATED',
  AWB_ASSIGNED: 'AWB_ASSIGNED',
  PICKUP_SCHEDULED: 'PICKUP_SCHEDULED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RTO_INITIATED: 'RTO_INITIATED',
  RTO_IN_TRANSIT: 'RTO_IN_TRANSIT',
  RTO_DELIVERED: 'RTO_DELIVERED',
  RETURNED: 'RETURNED',
};

const STATUS_LABELS = {
  ORDER_PLACED: 'Order Placed',
  ORDER_CONFIRMED: 'Order Confirmed',
  SHIPMENT_CREATED: 'Shipment Created',
  AWB_ASSIGNED: 'AWB Assigned',
  PICKUP_SCHEDULED: 'Pickup Scheduled',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RTO_INITIATED: 'Return Initiated (RTO)',
  RTO_IN_TRANSIT: 'Return In Transit',
  RTO_DELIVERED: 'Returned to Seller',
  RETURNED: 'Returned',
};

// Map raw Shiprocket status string or numeric code to standard internal status
const normalizeShiprocketStatus = (rawStatus) => {
  if (!rawStatus) return SHIPPING_STATUSES.AWB_ASSIGNED;
  const s = String(rawStatus).trim().toUpperCase();

  // Shiprocket common text and code status mappings
  if ((s.includes('DELIVERED') && !s.includes('RTO')) || s === '7') return SHIPPING_STATUSES.DELIVERED;
  if (s.includes('OUT FOR DELIVERY') || s === 'OUT_FOR_DELIVERY' || s === '17') return SHIPPING_STATUSES.OUT_FOR_DELIVERY;
  if (s.includes('IN TRANSIT') || s === 'IN_TRANSIT' || s === '18' || s === 'REACHED AT DESTINATION HUB') return SHIPPING_STATUSES.IN_TRANSIT;
  if (s.includes('PICKED UP') || s === 'PICKED_UP' || s === '19' || s === 'PICKED') return SHIPPING_STATUSES.PICKED_UP;
  if (s.includes('PICKUP SCHEDULED') || s === 'PICKUP_SCHEDULED' || s === '13') return SHIPPING_STATUSES.PICKUP_SCHEDULED;
  if (s.includes('AWB ASSIGNED') || s === 'AWB_ASSIGNED' || s === '6' || s === 'READY TO SHIP' || s === 'READY_TO_SHIP') return SHIPPING_STATUSES.AWB_ASSIGNED;
  if (s.includes('SHIPMENT CREATED') || s === 'SHIPMENT_CREATED' || s === 'NEW') return SHIPPING_STATUSES.SHIPMENT_CREATED;
  if (s.includes('CANCELED') || s.includes('CANCELLED')) return SHIPPING_STATUSES.CANCELLED;
  if (s.includes('RTO DELIVERED')) return SHIPPING_STATUSES.RTO_DELIVERED;
  if (s.includes('RTO IN TRANSIT') || s.includes('RTO-IN-TRANSIT')) return SHIPPING_STATUSES.RTO_IN_TRANSIT;
  if (s.includes('RTO') || s.includes('RETURN')) return SHIPPING_STATUSES.RTO_INITIATED;

  return SHIPPING_STATUSES.IN_TRANSIT;
};

// Timeline step number (1 to 6)
const getTimelineStep = (status) => {
  switch (status) {
    case SHIPPING_STATUSES.ORDER_PLACED:
    case SHIPPING_STATUSES.ORDER_CONFIRMED:
      return 1;
    case SHIPPING_STATUSES.SHIPMENT_CREATED:
    case SHIPPING_STATUSES.AWB_ASSIGNED:
      return 2;
    case SHIPPING_STATUSES.PICKUP_SCHEDULED:
    case SHIPPING_STATUSES.PICKED_UP:
      return 3;
    case SHIPPING_STATUSES.IN_TRANSIT:
      return 4;
    case SHIPPING_STATUSES.OUT_FOR_DELIVERY:
      return 5;
    case SHIPPING_STATUSES.DELIVERED:
      return 6;
    case SHIPPING_STATUSES.RTO_INITIATED:
    case SHIPPING_STATUSES.RTO_IN_TRANSIT:
    case SHIPPING_STATUSES.RTO_DELIVERED:
      return 99; // Special RTO step
    case SHIPPING_STATUSES.CANCELLED:
      return -1;
    default:
      return 1;
  }
};

module.exports = {
  SHIPPING_STATUSES,
  STATUS_LABELS,
  normalizeShiprocketStatus,
  getTimelineStep,
};
