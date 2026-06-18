import React, { useState, useEffect } from "react";
import type { MediaAsset, MediaType } from "@paperclipai/media-core";

interface GalleryWidgetProps {
  assets: MediaAsset[];
  onFilterChange?: (filters: { type?: MediaType; query?: string }) => void;
  onAssetClick?: (asset: MediaAsset) => void;
}

export function GalleryWidget({ assets, onFilterChange, onAssetClick }: GalleryWidgetProps) {
  const [filterType, setFilterType] = useState<MediaType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAssets = assets.filter(asset => {
    if (filterType !== "all" && asset.type !== filterType) return false;
    if (searchQuery && !asset.prompt.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const typeCounts = {
    all: assets.length,
    image: assets.filter(a => a.type === "image").length,
    video: assets.filter(a => a.type === "video").length,
    audio: assets.filter(a => a.type === "audio").length,
  };

  return (
    <div style={{ padding: "16px", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ margin: "0 0 16px 0", fontSize: "20px", fontWeight: 600 }}>Media Gallery</h2>
      
      {/* Filters */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          {(["all", "image", "video", "audio"] as const).map(type => (
            <button
              key={type}
              onClick={() => {
                setFilterType(type);
                onFilterChange?.({ type: type === "all" ? undefined : type, query: searchQuery });
              }}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #e5e7eb",
                background: filterType === type ? "#3b82f6" : "#fff",
                color: filterType === type ? "#fff" : "#374151",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)} ({typeCounts[type]})
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by prompt..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            onFilterChange?.({ type: filterType === "all" ? undefined : filterType, query: e.target.value });
          }}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid #e5e7eb",
            fontSize: "14px",
            minWidth: "200px",
          }}
        />
      </div>

      {/* Asset Grid */}
      {filteredAssets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
          No media assets found. Generate some media first!
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
          {filteredAssets.map(asset => (
            <div
              key={asset.id}
              onClick={() => onAssetClick?.(asset)}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                overflow: "hidden",
                cursor: onAssetClick ? "pointer" : "default",
                background: "#fff",
              }}
            >
              {/* Thumbnail placeholder */}
              <div style={{
                height: "120px",
                background: asset.type === "image" ? "#dbeafe" : asset.type === "video" ? "#fce7f3" : "#d1fae5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "48px",
              }}>
                {asset.type === "image" ? "🖼️" : asset.type === "video" ? "🎬" : "🔊"}
              </div>
              
              <div style={{ padding: "12px" }}>
                <div style={{ fontSize: "12px", color: "#6b7280", textTransform: "uppercase", fontWeight: 600, marginBottom: "4px" }}>
                  {asset.type}
                </div>
                <div style={{ fontSize: "14px", color: "#111827", fontWeight: 500, marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {asset.prompt || "Untitled"}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  {formatBytes(asset.byteSize)} · {new Date(asset.createdAt).toLocaleDateString()}
                </div>
                {asset.costCents > 0 && (
                  <div style={{ fontSize: "12px", color: "#059669", marginTop: "4px" }}>
                    Cost: {asset.costCents}¢
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
