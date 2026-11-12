import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: [
    "ag-studio",
    "ag-studio-react",
    "ag-grid-enterprise",
    "ag-grid-react",
    "ag-charts-enterprise",
    "@bryntum/scheduler",
    "@bryntum/scheduler-react",
  ],
  serverExternalPackages: ["@elastic/elasticsearch", "@paypal/paypal-server-sdk", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
