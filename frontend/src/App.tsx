import React, { useState } from "react";

import ChatInterface from "./components/ChatInterface";
import KibanaEmbed from "./components/KibanaEmbed";
import LogUploader from "./components/LogUploader";

type TabKey = "chat" | "upload" | "dashboard";

const tabs: { key: TabKey; label: string }[] = [
  { key: "chat", label: "Chat" },
  { key: "upload", label: "Upload Logs" },
  { key: "dashboard", label: "Dashboard" },
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("chat");

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex">
      <aside className="w-[250px] border-r border-gray-800 bg-gray-950 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-800">
          <h1 className="text-xl font-semibold tracking-tight">Logmind</h1>
          <p className="text-xs text-gray-400 mt-1">
            LLM-powered log analysis
          </p>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                activeTab === tab.key
                  ? "bg-indigo-600 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-800">
          Backend: <code className="text-gray-300">/api/*</code>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-hidden">
          {activeTab === "chat" && <ChatInterface />}
          {activeTab === "upload" && <LogUploader />}
          {activeTab === "dashboard" && <KibanaEmbed />}
        </div>
      </main>
    </div>
  );
};

export default App;
