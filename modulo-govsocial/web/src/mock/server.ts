import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Servidor MSW para testes unitários (vitest/jsdom).
export const server = setupServer(...handlers);
