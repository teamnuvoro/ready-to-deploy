import {
  cashfreeMode,
  getCashfreeBaseUrl,
  getCashfreeCredentials,
} from "./config";

const { appId: CASHFREE_APP_ID, secretKey: CASHFREE_SECRET_KEY } =
  getCashfreeCredentials();
const CASHFREE_BASE_URL = getCashfreeBaseUrl();

function getHeaders(extra: Record<string, string> = {}) {
  return {
    "x-client-id": CASHFREE_APP_ID,
    "x-client-secret": CASHFREE_SECRET_KEY,
    "x-api-version": "2023-08-01",
    ...extra,
  };
}

// Helper function to parse Cashfree error responses
function parseCashfreeError(errorResponse: any, defaultMessage: string): string {
  if (!errorResponse) {
    return defaultMessage;
  }
  
  // Try different possible error response formats
  if (typeof errorResponse === 'string') {
    return errorResponse;
  }
  
  // Check for common error field names
  const errorFields = ['error', 'message', 'errorMessage', 'msg', 'detail', 'description'];
  for (const field of errorFields) {
    if (errorResponse[field]) {
      return String(errorResponse[field]);
    }
  }
  
  // Check for nested error object
  if (errorResponse.error && typeof errorResponse.error === 'object') {
    return parseCashfreeError(errorResponse.error, defaultMessage);
  }
  
  // If it's an array of errors
  if (Array.isArray(errorResponse) && errorResponse.length > 0) {
    return parseCashfreeError(errorResponse[0], defaultMessage);
  }
  
  // Last resort: stringify the whole response if it's an object
  if (typeof errorResponse === 'object') {
    const errorStr = JSON.stringify(errorResponse);
    if (errorStr !== '{}') {
      return errorStr;
    }
  }
  
  return defaultMessage;
}

// Validate Cashfree credentials
function validateCredentials(): { valid: boolean; error?: string } {
  const hasAppId = CASHFREE_APP_ID && CASHFREE_APP_ID.trim().length > 0 && CASHFREE_APP_ID !== "TEST_APP_ID";
  const hasSecretKey = CASHFREE_SECRET_KEY && CASHFREE_SECRET_KEY.trim().length > 0;
  
  if (!hasAppId || !hasSecretKey) {
    return {
      valid: false,
      error: cashfreeMode === "sandbox" 
        ? "Cashfree credentials not configured. Please set CASHFREE_APP_ID and CASHFREE_SECRET_KEY in your .env file."
        : "Cashfree production credentials not configured."
    };
  }
  
  return { valid: true };
}

interface CreateOrderParams {
  orderId: string;
  orderAmount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
  customerId?: string;
}

interface CashfreeOrderResponse {
  cf_order_id: number;
  order_id: string;
  order_token: string;
  payment_session_id: string;
  order_status: string;
}

export async function createCashfreeOrder(params: CreateOrderParams): Promise<CashfreeOrderResponse> {
  // Validate credentials first
  const credentialCheck = validateCredentials();
  if (!credentialCheck.valid) {
    // Only use MOCK in sandbox mode if credentials are missing
    if (cashfreeMode === "sandbox") {
      console.warn("⚠️ Using MOCK Cashfree Order (Sandbox/No Creds)");
      return {
        cf_order_id: Math.floor(Math.random() * 100000),
        order_id: params.orderId,
        order_token: "mock_token_" + Date.now(),
        payment_session_id: "session_" + Date.now(),
        order_status: "ACTIVE",
      };
    }
    // In production, throw error if credentials are missing
    throw new Error(credentialCheck.error || "Cashfree credentials not configured");
  }

  try {
    const payload: Record<string, any> = {
      order_id: params.orderId,
      order_amount: params.orderAmount,
      order_currency: "INR",
      customer_details: {
        customer_id: params.customerId || params.customerEmail.replace(/[^a-zA-Z0-9_-]/g, "_"),
        customer_name: params.customerName,
        customer_email: params.customerEmail,
        customer_phone: params.customerPhone,
      },
      order_meta: {
        return_url: params.returnUrl,
      },
    };

    if (process.env.CASHFREE_WEBHOOK_URL) {
      payload.order_meta.notify_url = process.env.CASHFREE_WEBHOOK_URL;
    }

    const response = await fetch(`${CASHFREE_BASE_URL}/orders`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorResponse: any;
      try {
        const responseText = await response.text();
        errorResponse = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        errorResponse = { status: response.status, statusText: response.statusText };
      }
      
      const errorMessage = parseCashfreeError(errorResponse, 'Failed to create Cashfree order');
      console.error('Cashfree create order error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorResponse,
        message: errorMessage
      });
      
      // Provide more helpful error messages for authentication failures
      if (response.status === 401 || response.status === 403 || errorMessage.toLowerCase().includes('authentication')) {
        throw new Error(`Cashfree authentication failed: ${errorMessage}. Please check your CASHFREE_APP_ID and CASHFREE_SECRET_KEY credentials.`);
      }
      
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error: any) {
    // Don't wrap the error if it's already a meaningful Error object
    if (error instanceof Error && error.message) {
      console.error('Cashfree create order error:', error.message);
      throw error;
    }
    console.error('Cashfree create order error:', error);
    throw new Error(parseCashfreeError(error, 'Failed to create Cashfree order'));
  }
}

interface CashfreePaymentStatus {
  cf_order_id: number;
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: string;
  payment_session_id: string;
  cf_payment_id?: number;
  payment_amount?: number;
  payment_status?: string;
  payment_time?: string;
}

export async function getCashfreePaymentStatus(orderId: string): Promise<CashfreePaymentStatus> {
  const credentialCheck = validateCredentials();
  if (!credentialCheck.valid && cashfreeMode === "production") {
    throw new Error(credentialCheck.error || "Cashfree credentials not configured");
  }

  try {
    const response = await fetch(`${CASHFREE_BASE_URL}/orders/${orderId}`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      let errorResponse: any;
      try {
        const responseText = await response.text();
        errorResponse = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        errorResponse = { status: response.status, statusText: response.statusText };
      }
      
      const errorMessage = parseCashfreeError(errorResponse, 'Failed to get payment status');
      console.error('Cashfree payment status error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorResponse,
        message: errorMessage,
        orderId
      });
      
      if (response.status === 401 || response.status === 403 || errorMessage.toLowerCase().includes('authentication')) {
        throw new Error(`Cashfree authentication failed: ${errorMessage}. Please check your CASHFREE_APP_ID and CASHFREE_SECRET_KEY credentials.`);
      }
      
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error: any) {
    if (error instanceof Error && error.message) {
      console.error('Cashfree payment status error:', error.message);
      throw error;
    }
    console.error('Cashfree payment status error:', error);
    throw new Error(parseCashfreeError(error, 'Failed to get payment status'));
  }
}

// Payment Links API
interface CreatePaymentLinkParams {
  linkId: string;
  linkAmount: number;
  linkCurrency: string;
  linkPurpose: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

interface CashfreePaymentLinkResponse {
  cf_link_id: number;
  link_id: string;
  link_status: string;
  link_currency: string;
  link_amount: number;
  link_amount_paid: number;
  link_partial_payments: boolean;
  link_minimum_partial_amount: number | null;
  link_purpose: string;
  link_created_at: string;
  link_expiry_time: string | null;
  link_notes: object | null;
  link_auto_reminders: boolean;
  link_notify: object;
  customer_details: object;
  link_meta: object;
  link_url: string;
  link_qrcode: string;
}

export async function createCashfreePaymentLink(params: CreatePaymentLinkParams): Promise<CashfreePaymentLinkResponse> {
  const credentialCheck = validateCredentials();
  if (!credentialCheck.valid && cashfreeMode === "production") {
    throw new Error(credentialCheck.error || "Cashfree credentials not configured");
  }

  try {
    // Build customer details only if phone is provided (Cashfree requires it)
    const customerDetails = params.customerPhone ? {
      customer_name: params.customerName || 'Customer',
      customer_email: params.customerEmail || '',
      customer_phone: params.customerPhone,
    } : undefined;

    const requestBody: any = {
      link_id: params.linkId,
      link_amount: params.linkAmount,
      link_currency: params.linkCurrency,
      link_purpose: params.linkPurpose,
    };

    if (customerDetails) {
      requestBody.customer_details = customerDetails;
    }

    const response = await fetch(`${CASHFREE_BASE_URL}/links`, {
      method: "POST",
      headers: getHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorResponse: any;
      try {
        const responseText = await response.text();
        errorResponse = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        errorResponse = { status: response.status, statusText: response.statusText };
      }
      
      const errorMessage = parseCashfreeError(errorResponse, 'Failed to create Cashfree payment link');
      console.error('Cashfree create payment link error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorResponse,
        message: errorMessage
      });
      
      if (response.status === 401 || response.status === 403 || errorMessage.toLowerCase().includes('authentication')) {
        throw new Error(`Cashfree authentication failed: ${errorMessage}. Please check your CASHFREE_APP_ID and CASHFREE_SECRET_KEY credentials.`);
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('✅ Cashfree payment link created:', data.link_id, '→', data.link_url);
    return data;
  } catch (error: any) {
    if (error instanceof Error && error.message) {
      console.error('Cashfree create payment link error:', error.message);
      throw error;
    }
    console.error('Cashfree create payment link error:', error);
    throw new Error(parseCashfreeError(error, 'Failed to create Cashfree payment link'));
  }
}

export function getCashfreeModeForClient() {
  return cashfreeMode;
}
