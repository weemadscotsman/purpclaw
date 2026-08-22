import { TranscriptSegment } from "@/data/transcript";
import { Clock, Play, Share2, MessageSquare } from "lucide-react";

export function TranscriptViewer({ data }: { data: TranscriptSegment[] }) {
  return (
    <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
            <MessageSquare size={20} aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">AI Agents & The Future of Coding</h2>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <Clock size={14} aria-hidden="true" />
              13:40 - 20:30
            </p>
          </div>
        </div>
        <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label="Share transcript" title="Share transcript">
          <Share2 size={18} aria-hidden="true" />
        </button>
      </div>
      
      <div className="p-6 space-y-6">
        {data.map((segment, index) => (
          <div key={index} className="flex gap-4 group">
            <div className="flex-shrink-0 pt-1">
              <button className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors opacity-70 group-hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`Play segment at ${segment.time}`}>
                <Play size={12} aria-hidden="true" />
                {segment.time}
              </button>
            </div>
            <div className="flex-grow">
              <p className="text-gray-800 leading-relaxed text-lg">
                {segment.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
