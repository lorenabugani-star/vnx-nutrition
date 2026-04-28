// api/shipping.js
// Calcula frete via Melhor Envio
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { from, to, weight, height, width, length } = req.body;

    if (!from || !to) {
      return res.status(400).json({ error: 'CEP origem e destino obrigatórios' });
    }

    const TOKEN = process.env.MELHOR_ENVIO_TOKEN;

    // Se não tiver token do Melhor Envio, retorna frete estimado
    if (!TOKEN) {
      return res.status(200).json(getEstimatedShipping());
    }

    const payload = {
      from: { postal_code: from.replace(/\D/g, '') },
      to:   { postal_code: to.replace(/\D/g, '') },
      package: {
        height: Number(height) || 10,
        width:  Number(width)  || 10,
        length: Number(length) || 16,
        weight: Number(weight) || 0.3,
      },
      options: {
        receipt: false,
        own_hand: false,
      },
      services: '1,2,3,4,17', // PAC, SEDEX, SEDEX10, SEDEX12, PAC Mini
    };

    const response = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
        'User-Agent': 'VNX Nutrition (suporte@vnxnutrition.com.br)',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Fallback para frete estimado
      return res.status(200).json(getEstimatedShipping());
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Shipping error:', error.message);
    // Retorna estimativa em caso de erro
    return res.status(200).json(getEstimatedShipping());
  }
};

// Frete estimado (fallback sem token do Melhor Envio)
function getEstimatedShipping() {
  return [
    {
      id: 1,
      name: 'PAC',
      price: 15.90,
      delivery_time: 8,
      company: { name: 'Correios' },
    },
    {
      id: 2,
      name: 'SEDEX',
      price: 28.50,
      delivery_time: 3,
      company: { name: 'Correios' },
    },
  ];
}
