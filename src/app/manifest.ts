import type { MetadataRoute } from "next";

// "Adicionar à tela inicial" no celular: nome, cor e ícone "GE" do app (icon.png e apple-icon.png ficam em src/app).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Eventos IAM",
    short_name: "Eventos",
    description: "Escalas, comunicação, logística e custos do time de eventos.",
    start_url: "/inicio",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0539b9",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
