"use client";

import { Bot, Workflow } from "lucide-react";
import { careGridAgents } from "@/lib/agents/workflow";
import { Badge, Card } from "@/components/ui";

export function AgentPanel() {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#bc6f55]">Google ADK workflow</p>
          <h2 className="mt-1 font-display text-2xl">Agentic care coordination</h2>
        </div>
        <Badge tone="indigo">
          <Workflow size={13} />
          ADK-compatible
        </Badge>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {careGridAgents.slice(0, 8).map((agent) => (
          <div key={agent.name} className="rounded-3xl border border-[#24201c]/10 bg-white/48 p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-[#3f4d7a]/12 text-[#3f4d7a]">
                <Bot size={15} />
              </span>
              <p className="font-semibold">{agent.name}</p>
            </div>
            <p className="mt-3 text-sm leading-5 text-[#746b61]">{agent.purpose}</p>
            <p className="mt-3 rounded-full bg-[#24201c]/6 px-3 py-1 text-xs font-semibold text-[#746b61]">
              tool: {agent.tool}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
