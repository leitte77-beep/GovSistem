import type { Preview } from "@storybook/react";
import "../src/estilos/tokens.css";
import "../src/estilos/base.css";

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: {
      default: "paper",
      values: [{ name: "paper", value: "#FAFAF7" }],
    },
    a11y: {
      // Regras alinhadas ao critério de aceite (zero violação séria).
      config: {},
    },
  },
};

export default preview;
