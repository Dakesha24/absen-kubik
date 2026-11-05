"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

type GeoPoint = { latitude: number; longitude: number };

export default function LocationComparisonMap({ school, detected, title }: { school: GeoPoint; detected: GeoPoint; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;

    void import("leaflet").then((L) => {
      const container = containerRef.current;
      if (cancelled || !container) return;

      const activeMap = L.map(container, { zoomControl: true, scrollWheelZoom: true });
      map = activeMap;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(activeMap);

      const route: [number, number][] = [
        [school.latitude, school.longitude],
        [detected.latitude, detected.longitude],
      ];
      L.polyline(route, {
        color: "#17304c",
        weight: 7,
        opacity: 0.9,
        dashArray: "2 9",
        lineCap: "round",
        interactive: false,
      }).addTo(activeMap);
      L.polyline(route, {
        color: "#ffffff",
        weight: 3,
        opacity: 1,
        dashArray: "2 9",
        lineCap: "round",
        interactive: false,
      }).addTo(activeMap);

      const schoolMarker = L.circleMarker(route[0], {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#2862df",
        fillOpacity: 1,
      }).bindTooltip("Lokasi sekolah", { direction: "top", offset: [0, -8] }).addTo(activeMap);
      const detectedMarker = L.circleMarker(route[1], {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#e34d61",
        fillOpacity: 1,
      }).bindTooltip("Lokasi terdeteksi", { direction: "top", offset: [0, -8] }).addTo(activeMap);

      const bounds = L.featureGroup([schoolMarker, detectedMarker]).getBounds().pad(0.3);
      activeMap.fitBounds(bounds, { maxZoom: 16, animate: false });
      requestAnimationFrame(() => {
        if (!cancelled) {
          activeMap.invalidateSize();
          activeMap.fitBounds(bounds, { maxZoom: 16, animate: false });
        }
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
      map = null;
    };
  }, [school.latitude, school.longitude, detected.latitude, detected.longitude]);

  return <div className="location-map-frame comparison-map-frame" role="region" aria-label={title}>
    <div className="leaflet-location-map" ref={containerRef} />
    <div className="map-comparison-legend" aria-label="Keterangan lokasi">
      <span><i className="school" />Lokasi sekolah</span>
      <span><i className="detected" />Lokasi terdeteksi</span>
    </div>
  </div>;
}
