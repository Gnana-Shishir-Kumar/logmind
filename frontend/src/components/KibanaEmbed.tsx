import React, { useEffect, useState } from "react";

const KIBANA_URL = "http://localhost:5601";

const KibanaEmbed: React.FC = () => {
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch(KIBANA_URL, { mode: "no-cors" });
        if (!cancelled) {
          setReachable(true);
        }
      } catch {
        if (!cancelled) {
          setReachable(false);
        }
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-gray-800 px-6 py-3">
        <h2 className="text-lg font-semibold">Kibana Dashboard</h2>
        <p className="text-xs text-gray-400">
          Explore visual dashboards for your logs via Kibana.
        </p>
      </header>

      <div className="flex-1 px-6 py-4">
        {reachable === false && (
          <div className="mb-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-200">
            Start Kibana with{" "}
            <code className="text-yellow-100">docker-compose up</code> to see
            dashboards.
          </div>
        )}
        <div className="border border-gray-800 rounded-md overflow-hidden bg-black/40">
          <iframe
            title="Kibana"
            src={KIBANA_URL}
            className="w-full"
            style={{ height: 600 }}
          />
        </div>
      </div>
    </div>
  );
};

export default KibanaEmbed;
