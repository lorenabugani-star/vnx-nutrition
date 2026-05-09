// api/pix-status.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { payment_id } = req.query;

    if (!payment_id) {
      return res.status(400).json({ error: 'payment_id é obrigatório.' });
    }

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Token do Mercado Pago não configurado no servidor.' });
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('[PIX-STATUS] Erro MP:', JSON.stringify(mpData));
      return res.status(500).json({ error: 'Erro ao consultar pagamento.' });
    }

    // Retorna apenas o status — o frontend só precisa saber se foi 'approved'
    return res.status(200).json({
      payment_id: String(mpData.id),
      status: mpData.status,           // 'pending' | 'approved' | 'rejected' | 'cancelled'
      status_detail: mpData.status_detail,
    });

  } catch (error) {
    console.error('[PIX-STATUS] Erro handler:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
