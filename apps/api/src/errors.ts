import type { FastifyReply, FastifyRequest } from "fastify";

export function apiError(
  reply: FastifyReply,
  request: FastifyRequest,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return reply.code(statusCode).send({
    error: { code, message, ...(details === undefined ? {} : { details }) },
    request_id: request.id,
  });
}
