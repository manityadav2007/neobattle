import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBankSms } from '../services/smsParser';

test('Paytm Notification Parsing - Standard "Received ₹X from [Sender]"', () => {
  const result = parseBankSms('Received ₹10.05 from Rahul Sharma');
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 10.05);
  assert.equal(result.sender, 'Rahul Sharma');
  assert.equal(result.utrNumber, null);
});

test('Paytm Notification Parsing - Exact paise like 1.02', () => {
  const result = parseBankSms('Received ₹1.02 from John Doe');
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 1.02);
  assert.equal(result.sender, 'John Doe');
});

test('Paytm Notification Parsing - Space after currency symbol (₹ 10.05)', () => {
  const result = parseBankSms('Received ₹ 10.05 from Priya Singh');
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 10.05);
  assert.equal(result.sender, 'Priya Singh');
});

test('Paytm Notification Parsing - Rs. and Rs currency prefix', () => {
  const res1 = parseBankSms('Received Rs. 10.05 from Amit Kumar');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Amit Kumar');

  const res2 = parseBankSms('Received Rs 10.05 from Amit Kumar');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 10.05);
  assert.equal(res2.sender, 'Amit Kumar');

  const res3 = parseBankSms('Received INR 10.05 from Amit Kumar');
  assert.equal(res3.isCredit, true);
  assert.equal(res3.amount, 10.05);
  assert.equal(res3.sender, 'Amit Kumar');
});

test('Paytm Notification Parsing - Suffixes like "via UPI" and "on Paytm"', () => {
  const res1 = parseBankSms('Received ₹10.05 from Rahul Sharma via UPI');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Rahul Sharma');

  const res2 = parseBankSms('Received ₹10.05 from Rahul Sharma on Paytm');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 10.05);
  assert.equal(res2.sender, 'Rahul Sharma');
});

test('Paytm Notification Parsing - Context before "from" ("on Paytm from...", "in your account from...")', () => {
  const res1 = parseBankSms('Received ₹10.05 on Paytm from Rahul Sharma');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Rahul Sharma');

  const res2 = parseBankSms('Received ₹10.05 in your account from Rahul Sharma');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 10.05);
  assert.equal(res2.sender, 'Rahul Sharma');
});

test('Paytm Notification Parsing - UTR and Reference numbers', () => {
  const res1 = parseBankSms('Received ₹10.05 from Rahul Sharma (UPI Ref 123456789012)');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Rahul Sharma');
  assert.equal(res1.utrNumber, '123456789012');

  const res2 = parseBankSms('Received ₹10.05 from Rahul Sharma UPI Ref: 987654321098');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 10.05);
  assert.equal(res2.sender, 'Rahul Sharma');
  assert.equal(res2.utrNumber, '987654321098');
});

test('Paytm Notification Parsing - UPI ID in parentheses', () => {
  const result = parseBankSms('Received ₹10.05 from Rahul Sharma (UPI ID: rahul@upi)');
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 10.05);
  assert.equal(result.sender, 'Rahul Sharma');
});

test('Paytm Notification Parsing - "You have received" and "You\'ve received"', () => {
  const res1 = parseBankSms('You have received ₹10.05 from Rahul Sharma');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Rahul Sharma');

  const res2 = parseBankSms("You've received ₹1.02 from Sneha Patel");
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 1.02);
  assert.equal(res2.sender, 'Sneha Patel');
});

test('Paytm Notification Parsing - "Money received:" and "Payment received:" format', () => {
  const res1 = parseBankSms('Money received: ₹10.05 from Deepak Kumar');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Deepak Kumar');

  const res2 = parseBankSms('Money Received: ₹1.02 from Deepak Kumar');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 1.02);
  assert.equal(res2.sender, 'Deepak Kumar');

  const res3 = parseBankSms('Payment of ₹10.05 received from Suresh');
  assert.equal(res3.isCredit, true);
  assert.equal(res3.amount, 10.05);
  assert.equal(res3.sender, 'Suresh');
});

test('Paytm Notification Parsing - Amount first ("₹10.05 received from [Sender]")', () => {
  const res1 = parseBankSms('₹10.05 received from Rajesh Gupta');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Rajesh Gupta');

  const res2 = parseBankSms('₹ 1.02 received from Rajesh Gupta');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 1.02);
  assert.equal(res2.sender, 'Rajesh Gupta');

  const res3 = parseBankSms('₹10.05 received successfully from Rajesh Gupta');
  assert.equal(res3.isCredit, true);
  assert.equal(res3.amount, 10.05);
  assert.equal(res3.sender, 'Rajesh Gupta');
});

test('Paytm Notification Parsing - MacroDroid multiline forwarded notification', () => {
  const result = parseBankSms('Paytm\nReceived ₹10.05 from Rahul Sharma');
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 10.05);
  assert.equal(result.sender, 'Rahul Sharma');
});

test('Paytm Notification Parsing - Sender parameter preference and fallback', () => {
  // Extracted person name from message takes precedence over generic app title passed in sender param
  const res1 = parseBankSms('Received ₹10.05 from Rahul Sharma', 'Paytm');
  assert.equal(res1.isCredit, true);
  assert.equal(res1.amount, 10.05);
  assert.equal(res1.sender, 'Rahul Sharma');

  // When message does not contain a "from ...", uses the provided sender parameter
  const res2 = parseBankSms('Received ₹10.05', 'Kavita');
  assert.equal(res2.isCredit, true);
  assert.equal(res2.amount, 10.05);
  assert.equal(res2.sender, 'Kavita');
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

test('Bank SMS formats continue to work', () => {
  const result = parseBankSms(
    'Dear Customer, A/c *1234 credited by Rs 10.05 on 18-Oct-26 by transfer from Rahul Sharma. UPI Ref 123456789012'
  );
  assert.equal(result.isCredit, true);
  assert.equal(result.amount, 10.05);
  assert.equal(result.sender, 'Rahul Sharma');
  assert.equal(result.utrNumber, '123456789012');
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
