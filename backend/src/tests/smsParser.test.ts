import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBankSms } from '../services/smsParser';

// ==========================================
// 1. SuperMoney Notification Tests
// ==========================================

test('SuperMoney - Title first: "₹1.00 received from MANIT Deposited in your PNB bank..."', () => {
  const text = '₹1.00 received from MANIT Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details';
  const result = parseBankSms(text);
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 1.0);
  assert.equal(result.sender, 'MANIT');
  assert.equal(result.utrNumber, null);
});

test('SuperMoney - Text first: "Deposited in your PNB bank... ₹1.00 received from MANIT"', () => {
  const text = 'Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details ₹1.00 received from MANIT';
  const result = parseBankSms(text);
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 1.0);
  assert.equal(result.sender, 'MANIT');
  assert.equal(result.utrNumber, null);
});

test('SuperMoney - Exact paise amounts: 1.01 and 1.02 in both orders', () => {
  // Title first with 1.01
  const res1 = parseBankSms(
    '₹1.01 received from MANIT Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details'
  );
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 1.01);
  assert.equal(res1.sender, 'MANIT');

  // Text first with 1.02
  const res2 = parseBankSms(
    'Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details ₹1.02 received from MANIT'
  );
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 1.02);
  assert.equal(res2.sender, 'MANIT');

  // Title first with 10.05
  const res3 = parseBankSms(
    '₹10.05 received from MANIT Deposited in your SBI bank on 19 October at 05:18 AM. Tap to view details'
  );
  assert.equal(res3.isCredit, true);
  assert.equal(res3.amount, 10.05);
  assert.equal(res3.sender, 'MANIT');
});

test('SuperMoney - Optional sender name (missing "from [NAME]") in both orders', () => {
  // Title first without sender name
  const res1 = parseBankSms(
    '₹1.00 received Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details'
  );
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 1.0);
  assert.equal(res1.sender, null);
  assert.equal(res1.utrNumber, null);

  // Text first without sender name
  const res2 = parseBankSms(
    'Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details ₹1.00 received'
  );
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 1.0);
  assert.equal(res2.sender, null);
  assert.equal(res2.utrNumber, null);
});

test('SuperMoney - Full name with multiple words and spaces', () => {
  const text = '₹1.02 received from MANIT YADAV Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details';
  const result = parseBankSms(text);
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 1.02);
  assert.equal(result.sender, 'MANIT YADAV');
  assert.equal(result.utrNumber, null);
});

test('SuperMoney - Sender fallback to webhook parameter when not in text', () => {
  const text = '₹1.00 received Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details';
  const result = parseBankSms(text, 'super.money');
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 1.0);
  assert.equal(result.sender, 'super.money');
});

// ==========================================
// 2. Paytm Notification Tests (Kept intact)
// ==========================================

test('Paytm - Standard "Received ₹X from [Sender]"', () => {
  const result = parseBankSms('Received ₹10.05 from Rahul Sharma');
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 10.05);
  assert.equal(result.sender, 'Rahul Sharma');
  assert.equal(result.utrNumber, null);
});

test('Paytm - Exact paise like 1.02 and space after currency symbol', () => {
  const res1 = parseBankSms('Received ₹1.02 from John Doe');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 1.02);
  assert.equal(res1.sender, 'John Doe');

  const res2 = parseBankSms('Received ₹ 10.05 from Priya Singh');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 10.05);
  assert.equal(res2.sender, 'Priya Singh');
});

test('Paytm - Suffixes and UTR', () => {
  const res1 = parseBankSms('Received ₹10.05 from Rahul Sharma via UPI');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Rahul Sharma');

  const res2 = parseBankSms('Received ₹10.05 from Rahul Sharma (UPI Ref 123456789012)');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 10.05);
  assert.equal(res2.sender, 'Rahul Sharma');
  assert.equal(res2.utrNumber, '123456789012');
});

test('Paytm - "Money received:" and "You have received"', () => {
  const res1 = parseBankSms('Money received: ₹10.05 from Deepak Kumar');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Deepak Kumar');

  const res2 = parseBankSms('You have received ₹10.05 from Rahul Sharma');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 10.05);
  assert.equal(res2.sender, 'Rahul Sharma');
});

// ==========================================
// 3. PhonePe Notification Tests (Kept intact)
// ==========================================

test('PhonePe - "[Name] has sent ₹[amount] to your bank account"', () => {
  const res1 = parseBankSms('Rahul Sharma has sent ₹10.05 to your bank account');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Rahul Sharma');

  const res2 = parseBankSms('has sent ₹1.00 to your bank account');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 1.0);
  assert.equal(res2.sender, null);

  const res3 = parseBankSms('Amit has sent ₹1.02 to your account');
  assert.equal(res3.isCredit, true);
  assert.equal(res3.amount, 1.02);
  assert.equal(res3.sender, 'Amit');
});

// ==========================================
// 4. Standard Bank SMS & Debit Rejections
// ==========================================

test('Bank SMS - Standard Indian bank credit SMS', () => {
  const result = parseBankSms(
    'Dear Customer, A/c *1234 credited by Rs 10.05 on 18-Oct-26 by transfer from Rahul Sharma. UPI Ref 123456789012'
  );
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 10.05);
  assert.equal(result.sender, 'Rahul Sharma');
  assert.equal(result.utrNumber, '123456789012');
});

test('Debit / Spent notifications must be rejected (isCredit: false)', () => {
  const debits = [
    'Paid ₹10.05 to Rahul Sharma on Paytm',
    'Sent ₹10.05 to Rahul Sharma',
    'Debited ₹10.05 from your Paytm Payments Bank A/c',
    'Paid ₹500 at Merchant Store',
    'Payment of ₹50 sent to Rahul',
  ];

  for (const msg of debits) {
    const res = parseBankSms(msg);
    assert.equal(res.isCredit, false, `Expected isCredit: false for: "${msg}"`);
  }
});

test('Invalid and edge-case inputs handled gracefully', () => {
  const res1 = parseBankSms('');
  assert.equal(res1.isCredit, false);
  assert.equal(res1.amount, null);

  const res2 = parseBankSms(null as any);
  assert.equal(res2.isCredit, false);
  assert.equal(res2.amount, null);

  const res3 = parseBankSms('Hello, your OTP is 123456');
  assert.equal(res3.isCredit, false);
  assert.equal(res3.amount, null);
});
