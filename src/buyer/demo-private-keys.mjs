/**
 * DEMO KEYS. These private keys are public on purpose, so anyone can run the
 * buyer side of the demo. They protect nothing. Never reuse them.
 *
 * This file is the buyer's side of the wall. The web demo's "Buying as" picker
 * and scripts/buyer-agent.mjs read it. The shop must never import it:
 * src/server and src/app/api hold public keys only, and a test enforces that.
 *
 * Each entry also holds what the person told their agent: a ceiling, a city,
 * and a deadline. Those are the terms the agent signs. Text in a chat message
 * cannot change them.
 */
export const DEMO_BUYERS = {
  juniper: {
    agentId: "agt_juniper_household",
    name: "Juniper",
    ceiling: 880,
    city: "Austin 78702",
    deliverBy: "2026-10-09T12:00:00-05:00",
    note: "Household budget for one piece, in the room before Friday noon.",
    jwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "HNbta1CFJcqxccOLQi3TBEtCLGghhv-l_RnAi2ozBDA",
      d: "t6z0cfOkB7CmaR6CA_k7_xwhMepIjJEbK7G968E0HKs",
    },
  },
  northwind: {
    agentId: "agt_northwind",
    name: "Northwind",
    ceiling: 2000,
    city: "Dallas",
    deliverBy: "2026-11-30T17:00:00-06:00",
    note: "Office fit-out. Two thousand dollars is the limit.",
    jwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "MTbHAkDTEok7zZnF_3fa6AJRZMGczvX5dgmsyPUsSBY",
      d: "TYWZ5k9D9A0eTlrD-6zQjmPqE0fPrDHgmP3DW5RjsOc",
    },
  },
  atelier: {
    agentId: "agt_atelier",
    name: "Atelier",
    ceiling: 750,
    city: "Austin",
    deliverBy: "2026-10-31T17:00:00-05:00",
    note: "Studio purchase for a client room.",
    jwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "8Swcb-z-PAC6bRoAuc7vkRCazFS-fo2YOu33-b0xPB8",
      d: "icz3_XdR2fbGxEC3VNAUOd-kugSeZTkghmli3c4unvM",
    },
  },
  drift: {
    agentId: "agt_drift",
    name: "Drift",
    ceiling: 900,
    city: "Austin",
    deliverBy: "2026-10-31T17:00:00-05:00",
    note: "This key is real, but the shop has never registered it.",
    jwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "16zxAYySkndmfpf70GS8ZfbyRcj3ncI3lPTOCRWdJ9U",
      d: "Rg06oIVpKJE38GUHVDqJDoBpNj-csnQQBMPIWcwDKJ8",
    },
  },
};
