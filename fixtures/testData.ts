import { DocumentFormData, PartyDetails, LineItem, DocumentFeatures } from '../pages/BaseDocumentPage';
import { faker } from '@faker-js/faker';

// ============================================================================
// UTILITIES
// ============================================================================

export function generateEmail(prefix = 'user'): string {
  return `${faker.internet.username()}.${prefix}+${Date.now()}@yopmail.com`;
}

// ============================================================================
// SHARED ADDITIONAL FEATURES
// ============================================================================

export const standardFeatures: DocumentFeatures = {
  notes: 'Thank you for your business. Please contact us for any queries.',
  terms: 'Payment due within 30 days of invoice date.',
  contactDetails: true,
};

// ============================================================================
// INDIA — en-in  (GST / GSTIN, INR)
// ============================================================================

export const enIn = {

  businesses: {
    techSolutions: {
      name:    faker.company.name(),
      phone:   '9' + faker.string.numeric(9),
      email:   faker.internet.email(),
      taxId:   '29AABCT1234A1Z5',   // GSTIN — state auto-fills from this
      address: faker.location.streetAddress(),
      city:    'Bangalore',
      pincode: '560001',
    } satisfies PartyDetails,

    freelancer: {
      name:    faker.person.fullName(),
      phone:   '9' + faker.string.numeric(9),
      email:   faker.internet.email(),
      address: faker.location.streetAddress(),
      city:    'Pune',
      pincode: '411001',
      state:   'Maharashtra',
    } satisfies PartyDetails,

    minimal: {
      name: 'Freelancer',
    } satisfies PartyDetails,
  },

  clients: {
    acmeCorp: {
      name:    faker.company.name(),
      phone:   '9' + faker.string.numeric(9),
      email:   faker.internet.email(),
      taxId:   '27AAPBT1234H1Z6',   // GSTIN
      address: faker.location.streetAddress(),
      city:    'Mumbai',
      pincode: '400001',
    } satisfies PartyDetails,

    walkIn: {
      name: 'Walk-in Client',
    } satisfies PartyDetails,
  },

  lineItems: {
    consulting: {
      name:     'Consulting Services',
      hsnSac:   '998512',
      taxRate:  '18',
      quantity: '1',
      rate:     '50000',
    } satisfies LineItem,

    softwareLicense: {
      name:     'Software License',
      hsnSac:   '997331',
      taxRate:  '18',
      quantity: '5',
      rate:     '25000',
    } satisfies LineItem,

    webDevelopment: {
      name:        'Website Development',
      hsnSac:      '9983',
      taxRate:     '18',
      quantity:    '2',
      rate:        '30000',
      description: 'Custom frontend + backend development',
    } satisfies LineItem,

    simpleProduct: {
      name:     'Product A',
      taxRate:  '5',
      quantity: '10',
      rate:     '1000',
    } satisfies LineItem,
  },

  simpleInvoice: {
    business: { name: 'Freelancer' },
    client:   { name: 'Client Name' },
    items:    [{ quantity: '1', rate: '5000' }],
  } satisfies DocumentFormData,

  fullInvoice: {
    documentNumber: 'INV-' + faker.string.alphanumeric(6).toUpperCase(),
    business: {
      name:    faker.company.name(),
      phone:   '9' + faker.string.numeric(9),
      email:   faker.internet.email(),
      taxId:   '29AABCT1234A1Z5',
      address: faker.location.streetAddress(),
      city:    'Bangalore',
      pincode: '560001',
    },
    client: {
      name:    faker.company.name(),
      phone:   '9' + faker.string.numeric(9),
      email:   faker.internet.email(),
      taxId:   '27AAPBT1234H1Z6',
      address: faker.location.streetAddress(),
      city:    'Mumbai',
      pincode: '400001',
    },
    items: [
      { name: 'Consulting Services', hsnSac: '998512', taxRate: '18', quantity: '1', rate: '50000' },
      { name: 'Software License',    hsnSac: '997331', taxRate: '18', quantity: '5', rate: '25000' },
    ],
    features: standardFeatures,
  } satisfies DocumentFormData,

  invoiceWithDiscountOnTotal: {
    documentNumber: 'INV-' + faker.string.alphanumeric(6).toUpperCase(),
    business: { name: faker.company.name(), phone: '9' + faker.string.numeric(9), taxId: '29AABCT1234A1Z5', city: 'Bangalore', pincode: '560001' },
    client:   { name: faker.company.name(), phone: '9' + faker.string.numeric(9), taxId: '27AAPBT1234H1Z6', city: 'Mumbai',    pincode: '400001' },
    items: [
      { name: 'Website Development', hsnSac: '9983', taxRate: '18', quantity: '2', rate: '30000' },
    ],
    features: {
      discount: { type: 'total', value: '10', discountType: 'percentage' },
      notes: 'Discount applied on total amount.',
    },
  } satisfies DocumentFormData,

  invoiceWithItemWiseDiscount: {
    documentNumber: 'INV-' + faker.string.alphanumeric(6).toUpperCase(),
    business: { name: faker.company.name(), phone: '9' + faker.string.numeric(9), taxId: '29AABCT1234A1Z5', city: 'Bangalore', pincode: '560001' },
    client:   { name: faker.company.name(), phone: '9' + faker.string.numeric(9), taxId: '27AAPBT1234H1Z6', city: 'Mumbai',    pincode: '400001' },
    items: [
      { name: 'Consulting Services', hsnSac: '998512', taxRate: '18', quantity: '1', rate: '50000' },
      { name: 'Software License',    hsnSac: '997331', taxRate: '18', quantity: '3', rate: '10000' },
    ],
    features: {
      discount: { type: 'itemwise', itemDiscounts: { 0: '5', 1: '10' } },
    },
  } satisfies DocumentFormData,

  invoiceWithAdditionalCharge: {
    documentNumber: 'INV-' + faker.string.alphanumeric(6).toUpperCase(),
    business: { name: faker.company.name(), city: 'Pune', state: 'Maharashtra' },
    client:   { name: 'Walk-in Client' },
    items:    [{ quantity: '1', rate: '10000' }],
    features: {
      additionalCharge: { amount: '500', taxType: 'without' },
      notes: 'Shipping charges added.',
    },
  } satisfies DocumentFormData,
};

// ============================================================================
// UNITED KINGDOM — en-gb  (VAT, GBP)
// ============================================================================

export const enGb = {

  businesses: {
    techLtd: {
      name:    faker.company.name() + ' Ltd',
      phone:   '07' + faker.string.numeric(9),
      email:   faker.internet.email(),
      taxId:   'GB123456789',        // VAT number
      address: faker.location.streetAddress(),
      city:    'London',
      pincode: 'SW1A 2AA',
    } satisfies PartyDetails,

    minimal: {
      name: 'UK Freelancer',
    } satisfies PartyDetails,
  },

  clients: {
    britishCorp: {
      name:    faker.company.name() + ' Ltd',
      phone:   '07' + faker.string.numeric(9),
      email:   faker.internet.email(),
      taxId:   'GB987654321',
      address: faker.location.streetAddress(),
      city:    'London',
      pincode: 'NW1 6XE',
    } satisfies PartyDetails,
  },

  lineItems: {
    consulting: {
      name:     'Consulting Services',
      taxRate:  '20',
      quantity: '1',
      rate:     '5000',
    } satisfies LineItem,

    webDevelopment: {
      name:        'Web Development',
      taxRate:     '20',
      quantity:    '1',
      rate:        '3500',
      description: 'Full-stack web application',
    } satisfies LineItem,

    zeroRatedItem: {
      name:     'Books & Publications',
      taxRate:  '0',
      quantity: '5',
      rate:     '20',
    } satisfies LineItem,
  },

  simpleInvoice: {
    business: { name: 'UK Freelancer' },
    client:   { name: 'UK Client' },
    items:    [{ quantity: '1', rate: '1000' }],
  } satisfies DocumentFormData,

  fullInvoice: {
    documentNumber: 'INV-' + faker.string.alphanumeric(6).toUpperCase(),
    currency: 'GBP',
    business: {
      name:    faker.company.name() + ' Ltd',
      phone:   '07' + faker.string.numeric(9),
      email:   faker.internet.email(),
      taxId:   'GB123456789',
      address: faker.location.streetAddress(),
      city:    'London',
      pincode: 'SW1A 2AA',
    },
    client: {
      name:    faker.company.name() + ' Ltd',
      phone:   '07' + faker.string.numeric(9),
      email:   faker.internet.email(),
      taxId:   'GB987654321',
      address: faker.location.streetAddress(),
      city:    'London',
      pincode: 'NW1 6XE',
    },
    items: [
      { name: 'Consulting Services', taxRate: '20', quantity: '1', rate: '5000' },
      { name: 'Web Development',     taxRate: '20', quantity: '1', rate: '3500' },
    ],
    features: {
      notes: 'VAT registered. VAT number: GB123456789.',
      terms: 'Payment due within 30 days.',
    },
  } satisfies DocumentFormData,
};

// ============================================================================
// GLOBAL / INTERNATIONAL — en  (no tax, USD)
// ============================================================================

export const enGlobal = {

  businesses: {
    globalAgency: {
      name:    faker.company.name() + ' LLC',
      phone:   '+1 ' + faker.string.numeric(3) + ' ' + faker.string.numeric(3) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      address: faker.location.streetAddress(),
      city:    'New York',
      pincode: '10110',
    } satisfies PartyDetails,

    minimal: {
      name: 'Freelancer',
    } satisfies PartyDetails,
  },

  clients: {
    internationalCo: {
      name:    faker.company.name(),
      phone:   '+1 ' + faker.string.numeric(3) + ' ' + faker.string.numeric(3) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      address: faker.location.streetAddress(),
      city:    'San Francisco',
      pincode: '94105',
    } satisfies PartyDetails,
  },

  lineItems: {
    consulting: {
      name:        'Consulting Services',
      quantity:    '10',
      rate:        '150',
      description: 'Strategy consulting — 10 hours',
    } satisfies LineItem,

    design: {
      name:     'UI/UX Design',
      quantity: '1',
      rate:     '2500',
    } satisfies LineItem,
  },

  simpleInvoice: {
    business: { name: 'Freelancer' },
    client:   { name: 'Client' },
    items:    [{ quantity: '1', rate: '500' }],
  } satisfies DocumentFormData,

  fullInvoice: {
    documentNumber: 'INV-' + faker.string.alphanumeric(6).toUpperCase(),
    currency: 'USD',
    business: {
      name:    faker.company.name() + ' LLC',
      phone:   '+1 ' + faker.string.numeric(3) + ' ' + faker.string.numeric(3) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      address: faker.location.streetAddress(),
      city:    'New York',
      pincode: '10110',
    },
    client: {
      name:    faker.company.name(),
      phone:   '+1 ' + faker.string.numeric(3) + ' ' + faker.string.numeric(3) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      address: faker.location.streetAddress(),
      city:    'San Francisco',
      pincode: '94105',
    },
    items: [
      { name: 'Consulting Services', quantity: '10', rate: '150' },
      { name: 'UI/UX Design',        quantity: '1',  rate: '2500' },
    ],
    features: standardFeatures,
  } satisfies DocumentFormData,
};

// ============================================================================
// UAE — en-ae  (VAT / TRN, AED)
// ============================================================================

export const enAe = {

  businesses: {
    dubaiTech: {
      name:    faker.company.name(),
      phone:   '+971 ' + faker.string.numeric(2) + ' ' + faker.string.numeric(3) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      taxId:   '100123456700003',    // TRN (15-digit UAE Tax Registration Number)
      address: faker.location.streetAddress(),
      city:    'Dubai',
      pincode: '00000',
    } satisfies PartyDetails,
  },

  clients: {
    abuDhabiCorp: {
      name:    faker.company.name(),
      phone:   '+971 ' + faker.string.numeric(1) + ' ' + faker.string.numeric(3) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      taxId:   '100987654300003',
      address: faker.location.streetAddress(),
      city:    'Abu Dhabi',
      pincode: '00000',
    } satisfies PartyDetails,
  },

  lineItems: {
    consulting: {
      name:     'IT Consulting',
      taxRate:  '5',
      quantity: '1',
      rate:     '10000',
    } satisfies LineItem,
  },

  fullInvoice: {
    documentNumber: 'INV-' + faker.string.alphanumeric(6).toUpperCase(),
    currency: 'AED',
    business: {
      name:    faker.company.name(),
      phone:   '+971 ' + faker.string.numeric(2) + ' ' + faker.string.numeric(3) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      taxId:   '100123456700003',
      address: faker.location.streetAddress(),
      city:    'Dubai',
      pincode: '00000',
    },
    client: {
      name:  faker.company.name(),
      phone: '+971 ' + faker.string.numeric(1) + ' ' + faker.string.numeric(3) + ' ' + faker.string.numeric(4),
      taxId: '100987654300003',
      city:  'Abu Dhabi',
    },
    items:    [{ name: 'IT Consulting', taxRate: '5', quantity: '1', rate: '10000' }],
    features: {
      notes: 'VAT invoice — TRN: 100123456700003',
      terms: 'Payment due within 30 days.',
    },
  } satisfies DocumentFormData,
};

// ============================================================================
// AUSTRALIA — en-au  (GST / ABN, AUD)
// ============================================================================

export const enAu = {

  businesses: {
    sydneyTech: {
      name:    faker.company.name() + ' Pty Ltd',
      phone:   '+61 ' + faker.string.numeric(1) + ' ' + faker.string.numeric(4) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      taxId:   '51 824 753 556',     // ABN (11-digit)
      address: faker.location.streetAddress(),
      city:    'Sydney',
      pincode: '2000',
    } satisfies PartyDetails,
  },

  clients: {
    melbourneCo: {
      name:    faker.company.name() + ' Pty Ltd',
      phone:   '+61 ' + faker.string.numeric(1) + ' ' + faker.string.numeric(4) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      taxId:   '12 345 678 901',
      city:    'Melbourne',
      pincode: '3000',
    } satisfies PartyDetails,
  },

  lineItems: {
    consulting: {
      name:     'Strategy Consulting',
      taxRate:  '10',
      quantity: '1',
      rate:     '5000',
    } satisfies LineItem,
  },

  fullInvoice: {
    documentNumber: 'INV-' + faker.string.alphanumeric(6).toUpperCase(),
    currency: 'AUD',
    business: {
      name:    faker.company.name() + ' Pty Ltd',
      phone:   '+61 ' + faker.string.numeric(1) + ' ' + faker.string.numeric(4) + ' ' + faker.string.numeric(4),
      email:   faker.internet.email(),
      taxId:   '51 824 753 556',
      address: faker.location.streetAddress(),
      city:    'Sydney',
      pincode: '2000',
    },
    client: {
      name:  faker.company.name() + ' Pty Ltd',
      phone: '+61 ' + faker.string.numeric(1) + ' ' + faker.string.numeric(4) + ' ' + faker.string.numeric(4),
      taxId: '12 345 678 901',
      city:  'Melbourne',
    },
    items:    [{ name: 'Strategy Consulting', taxRate: '10', quantity: '1', rate: '5000' }],
    features: standardFeatures,
  } satisfies DocumentFormData,
};

// ============================================================================
// FACTORY — build a custom DocumentFormData from a base + overrides
// ============================================================================

export function createDocument(
  base:      DocumentFormData,
  overrides: Partial<DocumentFormData>,
): DocumentFormData {
  return { ...base, ...overrides };
}

// ============================================================================
// BACKWARDS-COMPATIBLE EXPORTS (keep old import paths working)
// ============================================================================

/** @deprecated Use enIn.simpleInvoice */
export const simpleInvoice = enIn.simpleInvoice;

/** @deprecated Use enIn.fullInvoice */
export const fullInvoice = enIn.fullInvoice;

/** @deprecated Use createDocument */
export const createInvoice = createDocument;

export const businesses = enIn.businesses;
export const clients     = enIn.clients;
export const lineItems   = enIn.lineItems;
