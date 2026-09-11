import Fastify from 'fastify';
import { z } from 'zod';
import axios from 'axios';
import NodeCache from 'node-cache';

const app = Fastify({ logger: true });

// Cache com tempo de vida (TTL) de 5 minutos (300 segundos)
const cache = new NodeCache({ stdTTL: 300 });

// Esquema de validação dos parâmetros da requisição
const convertQuerySchema = z.object({
  from: z.string().length(3).transform((val) => val.toUpperCase()),
  to: z.string().length(3).transform((val) => val.toUpperCase()),
  amount: z.coerce.number().positive(),
});

app.get('/convert', async (request, reply) => {
  try {
    // 1. Valida as entradas da URL (query params)
    const { from, to, amount } = convertQuerySchema.parse(request.query);

    const cacheKey = `${from}_${to}`;
    let rate = cache.get<number>(cacheKey);

    // 2. Se a taxa não estiver no cache, busca na API externa
    if (!rate) {
      const response = await axios.get(
        `https://open.er-api.com/v6/latest/${from}`
      );

      if (response.data.result !== 'success' || !response.data.rates[to]) {
        return reply.status(404).send({
          error: 'Currency not found or unsupported exchange pair.',
        });
      }

      rate = response.data.rates[to];
      cache.set(cacheKey, rate);
    }

    // 3. Calcula o valor convertido
    const convertedAmount = Number((amount * (rate as number)).toFixed(2));

    return {
      from,
      to,
      amount,
      rate,
      convertedAmount,
      cached: cache.has(cacheKey),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: 'Invalid request parameters',
        details: error.issues,
      });
    }

    return reply.status(500).send({ error: 'Internal server error' });
  }
});

// Inicialização do servidor na porta 3000
const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 Server running on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();