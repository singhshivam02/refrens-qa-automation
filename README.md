# Refrens QA Automation - Invoice Generator Tests

Automated end-to-end tests for Refrens invoice generator. Built with Playwright & TypeScript. Ready for GitHub and independent team use.

## Quick Start

### Installation
```bash
git clone <repo>
cd refrens-qa-automation-poc
npm install
cp .env.example .env
# Edit .env: ENVIRONMENT=staging, TEST_PASSWORD=your_password
```

### Run Tests
```bash
npm test                           # Run all tests
npm test -- --headed              # See browser
npm test -- --grep "complete"     # Specific test
npm run report                    # View results
```

## What Gets Tested

✅ Invoice number & header  
✅ Business details (name, email, GSTIN, address, etc.)  
✅ Client/Billed-to details  
✅ Currency selection  
✅ Line items (quantity, rate)  
✅ **Discount options**: Discount on Total (percentage/fixed) or Item Wise  
✅ Additional features (notes, terms, contact details)  
✅ Additional charges  
✅ Form submission with login & CAPTCHA handling  

## Page Object Methods

### Navigation
```typescript
await page.navigateToInvoiceGenerator()  // Go to invoice form
await page.clickCreateInvoiceCta()       // Click "Create" button
```

### Fill Details
```typescript
// Business details
await page.fillBusinessDetails(data)     // Fill all at once
await page.fillBusinessName(name)
await page.fillBusinessEmail(email)
await page.fillBusinessGstin(gstin)

// Client details (same pattern)
await page.fillClientDetails(data)
await page.fillClientName(name)
await page.fillClientEmail(email)

// Currency
await page.selectCurrency('INR')

// Line items
await page.fillLineItems(items)          // Fill all items
await page.fillLineItem(index, item)     // Fill one item
await page.addNewLineItem()              // Add another row
```

### Discount Options
```typescript
// Percentage discount on total amount
await page.addDiscountOnTotal('10', 'percentage')  // 10%

// Fixed amount discount
await page.addDiscountOnTotal('5000', 'fixed')     // ₹5000

// Individual discounts per line item
await page.addItemWiseDiscounts({
  0: '5',    // 5% off item 0
  1: '10'    // 10% off item 1
})

// Manual dropdown interaction (if needed)
await page.openDiscountsDropdown()
await page.clickGiveDiscountOnTotal()
await page.clickGiveItemWiseDiscount()
```

### Additional Features
```typescript
await page.addNotes('Invoice notes here')
await page.addTerms('Payment terms here')
await page.addAdditionalInfo('Additional info')
await page.addContactDetails()           // Auto-fill from business
await page.addAdditionalCharge('500', 'Shipping')
await page.toggleSummariseTotalQty()     // Show qty summary
```

### Submit
```typescript
await page.clickSaveAndContinue()
await page.loginAfterSave(password, captchaWaitMs)
```

### Fill Entire Form
```typescript
await page.fillForm(invoiceData)  // Complete form in one call
```

## Test Data Format

### Full Example
```typescript
const invoice = {
  invoiceNumber: 'INV-001',
  
  business: {
    name: 'Tech Solutions Ltd',
    phone: '9876543210',
    email: 'contact@tech.com',
    gstin: '29AABCT1234A1Z5',
    address: '123 Main Street',
    city: 'Bangalore',
    pincode: '560001',
    state: 'Karnataka',
    pan: 'AAAA12345B'
  },
  
  client: {
    name: 'Client Corp',
    phone: '9123456789',
    email: 'billing@client.com',
    gstin: '27AAPBT1234H1Z6',
    address: '456 Client Ave',
    city: 'Mumbai',
    pincode: '400001',
    state: 'Maharashtra'
  },
  
  items: [
    { quantity: '5', rate: '10000' },
    { quantity: '3', rate: '5000' }
  ],
  
  features: {
    notes: 'Thank you for business',
    terms: 'Pay within 30 days',
    contactDetails: true,
    
    // Discount Option 1: On Total
    discount: {
      type: 'total',
      value: '10',
      discountType: 'percentage'
    },
    
    // OR Discount Option 2: Item-wise
    discount: {
      type: 'itemwise',
      itemDiscounts: {
        0: '5',
        1: '10'
      }
    },
    
    additionalCharge: {
      value: '500',
      name: 'Shipping'
    },
    summariseTotalQty: true
  }
}

await page.fillForm(invoice)
```

## Available Test Data

In `fixtures/testData.ts`:

```typescript
// 10% percentage discount on total
import { fullInvoice } from './fixtures/testData'

// Item-wise discounts (5% & 10%)
import { invoiceWithItemWiseDiscounts } from './fixtures/testData'

// Fixed ₹5000 discount
import { invoiceWithFixedDiscount } from './fixtures/testData'
```

## Discount Dropdown Explained

When you click "Add Discounts", you see two options:

1. **Give Discount on Total**
   - Apply discount to entire invoice amount
   - Choose: percentage (%) or fixed amount (₹)
   - Example: 10% or ₹2500

2. **Give Item Wise Discount**
   - Apply different discount to each line item
   - Each item gets own discount percentage
   - Example: Item 1: 5%, Item 2: 10%

The implementation automatically:
- Opens dropdown
- Clicks selected option
- Fills discount values
- Verifies fields appear

All handled by `fillForm()` - just provide discount data!

## Environment Setup

Create `.env` file:

```env
ENVIRONMENT=staging
TEST_PASSWORD=your_actual_password
BASE_URL=https://staging-url.refrens.com
CAPTCHA_WAIT_MS=90000
```

## Project Structure

```
tests/
├── selectors.ts              # All DOM selectors (update if UI changes)
├── ui/
│   └── invoice-complete.spec.ts    # Main test file
└── ...

pages/
├── BasePage.ts               # Base page object class
└── InvoiceGeneratorPage.ts   # All invoice methods (50+ methods)

fixtures/
└── testData.ts               # Test scenarios & data

config/
└── environment.ts            # Load environment variables

playwright.config.ts          # Playwright settings
package.json                  # Dependencies
```

## For QA Team (GitHub Ready)

### First Time Setup
```bash
git clone <repo-url>
cd refrens-qa-automation-poc
npm install
cp .env.example .env
# Edit .env with your credentials
npm test
```

### Run Tests Independently
```bash
# Run all
npm test

# Run specific test
npm test -- tests/ui/invoice-complete.spec.ts

# See browser
npm test -- --headed

# View report
npm run report
```

### No Dependency on Original Developer

The code is designed for team independence:
- **All selectors** in one file (`selectors.ts`)
- **All methods** in one page object (`InvoiceGeneratorPage.ts`)
- **All test data** in one file (`testData.ts`)
- **Page Object Pattern** = UI changes only need selector updates
- **Easy to add** new tests or methods
- **Easy to extend** with new scenarios

### If UI Changes

Update only `tests/selectors.ts` with new CSS selectors - all tests still work!

### Adding New Tests

1. Create new file in `tests/ui/`
2. Import `InvoiceGeneratorPage`
3. Use existing methods from page object
4. Use test data from `fixtures/testData.ts`

Example:
```typescript
import { test } from '@playwright/test'
import { InvoiceGeneratorPage } from '../../pages/InvoiceGeneratorPage'
import { fullInvoice } from '../../fixtures/testData'

test('My new test', async ({ page }) => {
  const invoicePage = new InvoiceGeneratorPage(page)
  
  await invoicePage.navigateToInvoiceGenerator()
  await invoicePage.clickCreateInvoiceCta()
  await invoicePage.fillForm(fullInvoice)
  await invoicePage.clickSaveAndContinue()
  
  // Add your assertions
})
```

## Important Notes

### CAPTCHA
- Tests wait 90 seconds for manual CAPTCHA (change `CAPTCHA_WAIT_MS`)
- Only needed for full tests that do login
- See `invoice-complete.spec.ts` for examples

### Phone Fields
- Preloaded with "+91"
- Automatically handled by methods

### React Dropdowns
- Currency, state, country selections
- Automatically handled by methods

### Line Items
- Quantity and rate supported
- Name field optional

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Test times out | Increase `CAPTCHA_WAIT_MS` in .env |
| Login fails | Check `TEST_PASSWORD` in .env |
| Element not found | UI changed? Update `tests/selectors.ts` |
| "staging" error | Verify `ENVIRONMENT=staging` in .env |
| Tests slow | Run with `CAPTCHA_WAIT_MS=60000` for faster CAPTCHA |

## CI/CD Example

GitHub Actions workflow to run tests automatically:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
        env:
          ENVIRONMENT: staging
          TEST_PASSWORD: ${{ secrets.TEST_PASSWORD }}
      - uses: actions/upload-artifact@v2
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## Support

- **Tests Written**: In `tests/ui/invoice-complete.spec.ts`
- **Page Methods**: In `pages/InvoiceGeneratorPage.ts`
- **Selectors**: In `tests/selectors.ts`
- **Test Data**: In `fixtures/testData.ts`

To maintain: only update selectors if UI changes - everything else stays same!

---

**Status**: Production Ready  
**Type**: Page Object Model with Playwright  
**Language**: TypeScript  
**Ready for**: GitHub & Team Collaboration

