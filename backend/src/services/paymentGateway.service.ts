import { v4 as uuidv4 } from 'uuid';

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  reference: string;
  amount: number;
  message: string;
}

export interface PaymentIntent {
  amount: number;
  userId: string;
  description: string;
  metadata?: Record<string, unknown>;
}

class PaymentGatewayService {
  async createDeposit(intent: PaymentIntent): Promise<PaymentResult> {
    const reference = `DEP-${uuidv4().slice(0, 8).toUpperCase()}`;

    // Simulated payment gateway — replace with Stripe/Razorpay in production
    await this.simulateNetworkDelay();

    if (intent.amount <= 0 || intent.amount > 10000) {
      return {
        success: false,
        transactionId: '',
        reference,
        amount: intent.amount,
        message: 'Invalid deposit amount (min ₹1, max ₹10,000)',
      };
    }

    return {
      success: true,
      transactionId: uuidv4(),
      reference,
      amount: intent.amount,
      message: 'Deposit processed successfully',
    };
  }

  async processWithdrawal(intent: PaymentIntent): Promise<PaymentResult> {
    const reference = `WTH-${uuidv4().slice(0, 8).toUpperCase()}`;

    await this.simulateNetworkDelay();

    if (intent.amount <= 0) {
      return {
        success: false,
        transactionId: '',
        reference,
        amount: intent.amount,
        message: 'Invalid withdrawal amount',
      };
    }

    return {
      success: true,
      transactionId: uuidv4(),
      reference,
      amount: intent.amount,
      message: 'Withdrawal initiated successfully',
    };
  }

  async verifyPayment(reference: string): Promise<boolean> {
    await this.simulateNetworkDelay();
    return reference.startsWith('DEP-') || reference.startsWith('WTH-');
  }

  private simulateNetworkDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export const paymentGateway = new PaymentGatewayService();
