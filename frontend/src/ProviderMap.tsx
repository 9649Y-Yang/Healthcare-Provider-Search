import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import type { Provider } from "./types"

type ProviderMapProps = {
  center: {
    lat: number
    lon: number
    displayName: string
    radiusKm?: number
  }
  providers: Provider[]
}

export default function ProviderMap({ center, providers }: ProviderMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([center.lat, center.lon], 11)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current)
    } else {
      mapRef.current.setView([center.lat, center.lon], 11)
    }

    const map = mapRef.current
    const layerGroup = L.layerGroup().addTo(map)

    const points: L.LatLngExpression[] = [[center.lat, center.lon]]

    L.circleMarker([center.lat, center.lon], {
      radius: 10,
      color: "#1f5eff",
    })
      .bindPopup(center.displayName)
      .addTo(layerGroup)

    if (center.radiusKm) {
      L.circle([center.lat, center.lon], {
        radius: center.radiusKm * 1000,
        color: "#1f5eff",
        weight: 1,
        fillOpacity: 0.06,
      }).addTo(layerGroup)
    }

    providers.forEach((provider) => {
      points.push([provider.lat, provider.lon])
      L.circleMarker([provider.lat, provider.lon], {
        radius: 8,
        color: "#e05a2a",
      })
        .bindPopup(`<strong>${provider.name}</strong><br/>${provider.address}`)
        .addTo(layerGroup)
    })

    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [24, 24] })
    }

    return () => {
      layerGroup.remove()
    }
  }, [center, providers])

  useEffect(() => {
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} className="providerMap" />
}