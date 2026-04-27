// api/create-payment.js
// Serverless function — Vercel Edge
// Cria preferência de pagamento no Mercado Pago

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://vnxnutrition.com.br');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, customer, orderId, total } = req.body;

    if (!items || !customer || !orderId) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

    if (!ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Configuração de pagamento ausente' });
    }

    // Monta os itens para o MP
    const mpItems = items.map(item => ({
      id: item.id || String(Math.random()),
      title: item.name,
      description: item.flavor || item.name,
      quantity: item.qty,
      unit_price: Number(item.price),
      currency_id: 'BRL',
    }));

    // Preferência de pagamento
    const preference = {
      items: mpItems,
      payer: {
        name: customer.name,
        email: customer.email,
        identification: {
          type: 'CPF',
          number: customer.cpf?.replace(/\D/g, '') || '',
        },
        phone: {
          number: customer.phone?.replace(/\D/g, '') || '',
        },
        address: {
          street_name: customer.address || '',
          zip_code: customer.zip?.replace(/\D/g, '') || '',
        },
      },
      back_urls: {
        success: `https://vnxnutrition.com.br/pedido/sucesso?order=${orderId}`,
        failure: `https://vnxnutrition.com.br/pedido/erro?order=${orderId}`,
        pending: `https://vnxnutrition.com.br/pedido/pendente?order=${orderId}`,
      },
      auto_return: 'approved',
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' }, // Remove boleto
        ],
        installments: 12,
      },
      notification_url: `https://vnxnutrition.com.br/api/webhook`,
      external_reference: orderId,
      statement_descriptor: 'VNX NUTRITION',
      metadata: {
        order_id: orderId,
        customer_email: customer.email,
      },
    };

    // Chama a API do Mercado Pago
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'X-Idempotency-Key': orderId,
      },
      body: JSON.stringify(preference),
    });

    if (!mpResponse.ok) {
      const err = await mpResponse.json();
      console.error('MP Error:', err);
      return res.status(500).json({ error: 'Erro ao criar preferência de pagamento', details: err });
    }

    const mpData = await mpResponse.json();

    return res.status(200).json({
      preference_id: mpData.id,
      init_point: mpData.init_point,         // URL produção
      sandbox_init_point: mpData.sandbox_init_point, // URL sandbox
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
