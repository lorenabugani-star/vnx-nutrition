// api/create-payment.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items, customer, orderId, total, payMethod, installments, shipping } = req.body;

    if (!items || !customer || !orderId) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Token MP nao configurado' });
    }

    // Monta itens com o total já calculado (incluindo juros se parcelado)
    // Usamos um item único com o total correto para evitar divergência
    const mpItems = [
      {
        id: 'order-' + orderId.slice(0, 8),
        title: 'VNX Nutrition — Pedido',
        description: items.map(i => `${i.name} x${i.qty}`).join(', '),
        quantity: 1,
        unit_price: Number(Number(total).toFixed(2)),
        currency_id: 'BRL',
      }
    ];

    // Configura parcelas
    const maxInstallments = payMethod === 'pix' ? 1 : (installments || 12);

    const preference = {
      items: mpItems,
      payer: {
        name: customer.name,
        email: customer.email,
        identification: {
          type: 'CPF',
          number: (customer.cpf || '').replace(/\D/g, ''),
        },
      },
      back_urls: {
        success: 'https://vnxnutrition.com.br',
        failure: 'https://vnxnutrition.com.br',
        pending: 'https://vnxnutrition.com.br',
      },
      auto_return: 'approved',
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }],
        installments: maxInstallments,
        default_installments: installments || 1,
      },
      notification_url: 'https://vnxnutrition.com.br/api/webhook',
      external_reference: orderId,
      statement_descriptor: 'VNX NUTRITION',
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('MP Error:', JSON.stringify(mpData));
      return res.status(500).json({ error: 'Erro MP', details: mpData });
    }

    return res.status(200).json({
      preference_id: mpData.id,
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
    });

  } catch (error) {
    console.error('Handler error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
