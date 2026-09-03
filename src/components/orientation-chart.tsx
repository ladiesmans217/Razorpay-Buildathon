"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const orientationData = [
  { day: "Mon", score: 3 },
  { day: "Tue", score: 2 },
  { day: "Wed", score: 3 },
  { day: "Thu", score: 3 },
  { day: "Fri", score: 2 }
];

export function OrientationChart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={orientationData}>
        <defs>
          <linearGradient id="orientation" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7d6aa8" stopOpacity={0.45} />
            <stop offset="95%" stopColor="#7d6aa8" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(36,32,28,0.12)" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} />
        <YAxis domain={[0, 3]} hide />
        <Tooltip />
        <Area type="monotone" dataKey="score" stroke="#7d6aa8" fill="url(#orientation)" strokeWidth={3} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
