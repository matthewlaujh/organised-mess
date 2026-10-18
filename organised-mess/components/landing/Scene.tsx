'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { ScreenQuad } from '@react-three/drei'
import * as THREE from 'three'
import { blobsFrag, blobsVert } from './shaders/blobs'

function Blobs() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const seed = useMemo(() => Math.random() * 100, [])

  const uniforms = useMemo(
    () => ({
      u_time:       { value: 0 },
      u_resolution: { value: new THREE.Vector2(800, 600) },
      u_seed:       { value: seed },
    }),
    [seed]
  )

  useFrame((state) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.u_time.value = state.clock.elapsedTime
    // use drawingBuffer dimensions so gl_FragCoord matches at any DPR
    materialRef.current.uniforms.u_resolution.value.set(
      state.gl.drawingBufferWidth,
      state.gl.drawingBufferHeight
    )
  })

  return (
    <ScreenQuad>
      <shaderMaterial
        ref={materialRef}
        vertexShader={blobsVert}
        fragmentShader={blobsFrag}
        uniforms={uniforms}
      />
    </ScreenQuad>
  )
}

export default function Scene() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Canvas
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
      >
        <Blobs />
      </Canvas>
    </div>
  )
}