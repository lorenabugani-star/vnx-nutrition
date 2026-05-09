// api/create-pix-payment.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      orderId, order_id,
      total, amount,
      customer,
      customer_name, customer_email, customer_cpf, customer_phone,
      items,
    } = req.body;

    // Aceita os campos tanto no formato simples quanto aninhado
    const oid    = orderId || order_id;
    const value  = Number(total || amount);
    const name   = (customer && customer.name)  || customer_name;
    const email  = (customer && customer.email) || customer_email;
    const cpf    = ((customer && customer.cpf)  || customer_cpf || '').replace(/\D/g, '');
    const phone  = (customer && customer.phone) || customer_phone || '';

    if (!oid || !value || !email) {
      return res.status(400).json({ success: false, message: 'Dados incompletos: orderId, total e email são obrigatórios.' });
    }

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) {
      return res.status(500).json({ success: false, message: 'Token do Mercado Pago não configurado no servidor.' });
    }

    // Monta o payload de pagamento PIX
    const payload = {
      transaction_amount: Number(value.toFixed(2)),
      description: items
        ? items.map(i => `${i.name} x${i.qty}`).join(', ')
        : 'VNX Nutrition — Pedido',
      payment_method_id: 'pix',
      external_reference: oid,
      notification_url: 'https://vnxnutrition.com.br/api/webhook',
      payer: {
        email,
        first_name: name ? name.split(' ')[0] : '',
        last_name:  name ? name.split(' ').slice(1).join(' ') : '',
        identification: { type: 'CPF', number: cpf },
      },
      // PIX expira em 30 minutos
      date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };

    console.log('[PIX] Criando pagamento MP:', { oid, value, email });

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        // Idempotency key evita pagamentos duplicados em retentativas
        'X-Idempotency-Key': `pix-${oid}`,
      },
      body: JSON.stringify(payload),
    });

    const mpData = await mpResponse.json();
    console.log('[PIX] Resposta MP:', mpResponse.status, mpData.id, mpData.status);

    if (!mpResponse.ok) {
      console.error('[PIX] Erro MP:', JSON.stringify(mpData));
      const msg = mpData.message || (mpData.cause && mpData.cause[0]?.description) || 'Erro ao gerar PIX no Mercado Pago.';
      return res.status(500).json({ success: false, message: msg });
    }

    // Extrai QR Code da resposta do MP
    const txData = mpData.point_of_interaction?.transaction_data;
    if (!txData?.qr_code) {
      console.error('[PIX] QR Code não retornado:', JSON.stringify(mpData));
      return res.status(500).json({ success: false, message: 'Mercado Pago não retornou o QR Code PIX.' });
    }

    return res.status(200).json({
      success: true,
      payment_id: String(mpData.id),
      status: mpData.status,
      qr_code: txData.qr_code,
      qr_code_base64: txData.qr_code_base64 || null,
      date_of_expiration: mpData.date_of_expiration,
      total: value,
    });

  } catch (error) {
    console.error('[PIX] Erro handler:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};
