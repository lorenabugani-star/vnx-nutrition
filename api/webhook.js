// api/webhook.js
// Recebe notificações do Mercado Pago e atualiza o banco

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // service key — nunca exposta no frontend
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const { type, data } = req.body;

    // Apenas processa notificações de pagamento
    if (type !== 'payment') {
      return res.status(200).json({ received: true });
    }

    const paymentId = data?.id;
    if (!paymentId) {
      return res.status(400).json({ error: 'Payment ID ausente' });
    }

    // Busca detalhes do pagamento no MP
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      },
    });

    if (!mpRes.ok) {
      return res.status(500).json({ error: 'Falha ao buscar pagamento no MP' });
    }

    const payment = await mpRes.json();
    const orderId = payment.external_reference;
    const status = payment.status; // approved | pending | rejected

    // Mapeia status MP → status interno
    const statusMap = {
      approved: 'paid',
      pending: 'pending',
      in_process: 'processing',
      rejected: 'cancelled',
      refunded: 'refunded',
      cancelled: 'cancelled',
    };

    const internalStatus = statusMap[status] || 'pending';

    // Atualiza pedido no Supabase
    await sb.from('orders').update({
      payment_status: internalStatus,
      status: internalStatus === 'paid' ? 'processing' : internalStatus,
      mp_payment_id: String(paymentId),
    }).eq('id', orderId);

    // Atualiza pagamento no Supabase
    await sb.from('payments').update({
      mp_payment_id: String(paymentId),
      status: internalStatus,
      payment_method: payment.payment_type_id,
      paid_at: status === 'approved' ? new Date().toISOString() : null,
      raw_data: payment,
    }).eq('order_id', orderId);

    // TODO: Disparar e-mail de confirmação via Resend
    // TODO: Disparar notificação WhatsApp

    return res.status(200).json({ received: true, status: internalStatus });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Erro interno' });
  }
}
