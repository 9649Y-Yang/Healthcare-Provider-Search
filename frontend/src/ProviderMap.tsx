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
  fitToResultsVersion?: number
  onBoundsChange?: (bounds: {
    north: number
    south: number
    east: number
    west: number
  }) => void
}

export default function ProviderMap({
  center,
  providers,
  fitToResultsVersion,
  onBoundsChange,
}: ProviderMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const boundsCallbackRef = useRef<typeof onBoundsChange>(onBoundsChange)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const lastFitVersionRef = useRef<number | null>(null)

  useEffect(() => {
    boundsCallbackRef.current = onBoundsChange
  }, [onBoundsChange])

  useEffect(() => {
    if (!containerRef.current) return

    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current).setView([center.lat, center.lon], 11)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(mapRef.current)
    }

    const map = mapRef.current

    const emitBounds = () => {
      if (!boundsCallbackRef.current) return
      const bounds = map.getBounds()
      boundsCallbackRef.current({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      })
    }

    const handleViewportChange = () => emitBounds()
    map.on("moveend", handleViewportChange)
    map.on("zoomend", handleViewportChange)

    emitBounds()

    return () => {
      map.off("moveend", handleViewportChange)
      map.off("zoomend", handleViewportChange)
    }
  }, [center.lat, center.lon])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markerLayerRef.current?.remove()
    const layerGroup = L.layerGroup().addTo(map)
    markerLayerRef.current = layerGroup

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

    const shouldFitToResults =
      fitToResultsVersion != null && fitToResultsVersion !== lastFitVersionRef.current

    if (shouldFitToResults) {
      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [24, 24] })
      } else {
        map.setView([center.lat, center.lon], 11)
      }
      lastFitVersionRef.current = fitToResultsVersion ?? null
    }

    return () => {
      layerGroup.remove()
    }
  }, [center, providers, fitToResultsVersion])

  useEffect(() => {
    return () => {
      markerLayerRef.current?.remove()
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} className="providerMap" />
}