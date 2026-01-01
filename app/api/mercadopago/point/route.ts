import { NextResponse } from 'next/server';

const MP_API_URL = 'https://api.mercadopago.com/point/integrated_entity/devices';

export async function POST(request: Request) {
    try {
        const { amount, orderId, deviceId } = await request.json();
        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

        if (!accessToken) {
            return NextResponse.json({ error: 'Mercado Pago Access Token not configured' }, { status: 500 });
        }

        if (!deviceId) {
            return NextResponse.json({ error: 'Device ID is required' }, { status: 400 });
        }

        const response = await fetch(`${MP_API_URL}/${deviceId}/payment_intents`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': orderId, // Use orderId as idempotency key
            },
            body: JSON.stringify({
                amount: Math.round(amount * 100) / 100, // Ensure numeric amount
                description: `Order #${orderId.slice(0, 8)}`,
                payment: {
                    installments: 1,
                    type: 'credit_card', // Defaulting to credit_card for point
                },
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('MP Point Error:', data);
            return NextResponse.json({ error: data.message || 'Failed to create payment intent' }, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Internal Server Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get('deviceId');
        const paymentIntentId = searchParams.get('paymentIntentId');
        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

        if (!accessToken) {
            return NextResponse.json({ error: 'Mercado Pago Access Token not configured' }, { status: 500 });
        }

        if (!deviceId || !paymentIntentId) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const response = await fetch(`${MP_API_URL}/${deviceId}/payment_intents/${paymentIntentId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch status' }, { status: response.status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Internal Server Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
