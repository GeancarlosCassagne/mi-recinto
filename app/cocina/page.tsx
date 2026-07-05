'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle, Clock, User, Bike, UtensilsCrossed, AlertCircle, AlertTriangle } from 'lucide-react';

interface DetallePedido {
  cantidad: number;
  platos: { nombre: string };
}

interface Pedido {
  id: string;
  mesa: string;
  estado: string;
  created_at: string;
  detalles_pedido: DetallePedido[];
}

export default function CocinaPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  
  // El estado almacena el objeto completo del pedido seleccionado para mostrar sus detalles
  const [pedidoAConfirmar, setPedidoAConfirmar] = useState<Pedido | null>(null);

  const obtenerPedidosDelDia = async () => {
    const hoy = new Date().toISOString().split('T')[0];
    
    const { data } = await supabase
      .from('pedidos')
      .select('id, mesa, estado, created_at, detalles_pedido (cantidad, platos (nombre))')
      .in('estado', ['pendiente', 'entregado'])
      .gte('created_at', `${hoy} 00:00:00`)
      .lte('created_at', `${hoy} 23:59:59`)
      .order('created_at', { ascending: true });

    if (data) setPedidos(data as unknown as Pedido[]);
  };

  useEffect(() => {
    obtenerPedidosDelDia();
    
    // Canal en tiempo real para recibir pedidos y modificaciones de platos al instante
    const canalCocina = supabase
      .channel('realtime-cocina-flow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => obtenerPedidosDelDia())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'detalles_pedido' }, () => obtenerPedidosDelDia())
      .subscribe();

    return () => { 
      supabase.removeChannel(canalCocina); 
    };
  }, []);

  const ejecutarDespacho = async () => {
    if (!pedidoAConfirmar) return;
    
    await supabase.from('pedidos').update({ estado: 'entregado' }).eq('id', pedidoAConfirmar.id);
    setPedidoAConfirmar(null);
    obtenerPedidosDelDia();
  };

  const desglosarCabeceraPedido = (textoMesa: string) => {
    let rawMesa = textoMesa;
    let esParaLlevar = false;
    let mesera = 'No especificada';
    let especificaciones: string[] = [];
    let adicionales: string[] = [];

    if (rawMesa.includes('[TIPO:LLEVAR]')) {
      esParaLlevar = true;
      rawMesa = rawMesa.replace('[TIPO:LLEVAR]', '').trim();
    }
    if (rawMesa.includes('[TIPO:SERVIR]')) {
      rawMesa = rawMesa.replace('[TIPO:SERVIR]', '').trim();
    }
    if (rawMesa.includes('[MESERA:')) {
      mesera = rawMesa.split('[MESERA:')[1].split(']')[0].trim();
      rawMesa = rawMesa.split('[MESERA:')[0].trim();
    }
    if (textoMesa.includes('Especificaciones:')) {
      const parteEspecificaciones = textoMesa.split('Especificaciones:')[1].replace(']', '').trim();
      especificaciones = parteEspecificaciones.split('|').map(s => s.trim()).filter(Boolean);
    }
    
    // Extracción limpia para aislar las notas adicionales y evitar que absorba especificaciones
    if (textoMesa.includes('[EXTRA:')) {
      let parteExtras = textoMesa.split('[EXTRA:')[1];
      if (parteExtras.includes('Especificaciones:')) {
        parteExtras = parteExtras.split('Especificaciones:')[0].replace('|', '').trim();
      }
      parteExtras = parteExtras.replace(']', '').trim();
      adicionales = parteExtras.split(',').map(s => s.trim()).filter(Boolean);
    }

    if (rawMesa.includes('[EXTRA:')) {
      rawMesa = rawMesa.split('[EXTRA:')[0].trim();
    }

    return { numeroMesa: rawMesa, esParaLlevar, mesera, especificaciones, adicionales };
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 w-full relative">
      <header className="border-b border-slate-800 pb-4 mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-2">
          🍳 Monitor de Cocina <span className="text-emerald-400 font-medium text-sm bg-emerald-950/60 px-3 py-1 rounded-xl border border-emerald-900/50">Flujo General Diario</span>
        </h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Órdenes Sincronizadas</p>
      </header>

      {pedidos.length === 0 ? (
        <div className="h-[70vh] flex flex-col items-center justify-center text-slate-500 italic text-sm">
          <Clock className="h-10 w-10 text-slate-700 mb-2 animate-pulse" />
          <span>No se registran pedidos en el sistema para el día de hoy.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pedidos.map((p) => {
            const { numeroMesa, esParaLlevar, mesera, especificaciones, adicionales } = desglosarCabeceraPedido(p.mesa);
            const hora = new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const estaDespachado = p.estado === 'entregado';

            return (
              <div 
                key={p.id} 
                className={`border rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between transition-all duration-200 ${
                  estaDespachado 
                    ? 'bg-slate-800/40 border-slate-800 opacity-60' 
                    : 'bg-slate-800 border-slate-700/70'
                }`}
              >
                <div>
                  {estaDespachado ? (
                    <div className="bg-slate-700 text-slate-300 font-black text-xs uppercase px-4 py-2.5 tracking-wider flex items-center justify-center gap-2 shadow-inner">
                      <CheckCircle className="h-4 w-4" />
                      <span>Pedido Completado / Despachado</span>
                    </div>
                  ) : esParaLlevar ? (
                    <div className="bg-rose-600 text-white font-black text-sm uppercase px-4 py-3 tracking-wider flex items-center justify-center gap-2 shadow-inner animate-pulse">
                      <Bike className="h-5 w-5 stroke-[3]" />
                      <span>¡Para Llevar / Tarrina!</span>
                    </div>
                  ) : (
                    <div className="bg-emerald-600 text-white font-black text-sm uppercase px-4 py-3 tracking-wider flex items-center justify-center gap-2 shadow-inner">
                      <UtensilsCrossed className="h-5 w-5 stroke-[3]" />
                      <span>Para Servirse en Mesa</span>
                    </div>
                  )}

                  <div className={`p-4 border-b border-slate-700/50 flex justify-between items-center ${estaDespachado ? 'bg-slate-900/20' : 'bg-slate-800/40'}`}>
                    <div>
                      <h2 className={`text-xl font-black tracking-tight uppercase ${estaDespachado ? 'text-slate-400 line-through' : 'text-white'}`}>
                        {esParaLlevar ? `Cliente: ${numeroMesa}` : `Mesa ${numeroMesa}`}
                      </h2>
                      <span className="text-[10px] bg-slate-700 text-slate-300 font-bold px-2 py-0.5 rounded-md uppercase mt-1 inline-flex items-center gap-1">
                        <User className="h-2.5 w-2.5" /> {mesera}
                      </span>
                    </div>
                    <span className="text-xs bg-slate-900 px-2.5 py-1.5 rounded-xl text-slate-400 font-mono font-bold flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-amber-500" /> {hora}
                    </span>
                  </div>

                  <div className="p-4 space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Platos a Servir</p>
                    <div className="space-y-2">
                      {p.detalles_pedido?.map((det, idx) => (
                        <div key={idx} className="flex justify-between items-start text-sm bg-slate-900/40 p-2.5 border border-slate-700/30 rounded-xl">
                          <p className={`font-bold capitalize ${estaDespachado ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                            • {det.platos?.nombre}
                          </p>
                          <span className={`font-black text-xs px-2 py-0.5 rounded-lg shrink-0 ${estaDespachado ? 'bg-slate-800 text-slate-500 border border-slate-700' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                            x{det.cantidad}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* LISTADO DE NOTAS / ADICIONALES DE LA ORDEN */}
                    {adicionales && adicionales.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest mb-1">Notas / Adicionales:</p>
                        {adicionales.map((item, index) => (
                          <div key={index} className="bg-sky-950/40 border border-sky-900/40 p-2 rounded-xl text-xs font-bold text-sky-300 capitalize">
                            ➕ {item}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* DETALLES DE COMPOSICIÓN DEL ALMUERZO EN LA PARTE INFERIOR */}
                    {especificaciones.length > 0 && (
                      <div className="mt-4 border-t border-dashed border-slate-700 pt-3">
                        <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-1.5">Detalles del Pedido:</p>
                        <div className="flex flex-col gap-1">
                          {templatesTexto(especificaciones)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-slate-800/80 border-t border-slate-700/40">
                  {estaDespachado ? (
                    <div className="w-full bg-slate-900 text-slate-500 font-bold text-xs uppercase py-3.5 rounded-xl text-center border border-slate-800 flex items-center justify-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      <span>Listo y Entregado</span>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setPedidoAConfirmar(p)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase py-3.5 rounded-xl transition flex items-center justify-center gap-1.5 tracking-wider shadow-md focus:outline-none"
                    >
                      <CheckCircle className="h-4 w-4 stroke-[3]" />
                      <span>Despachar Pedido</span>
                    </button>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CENTRAL DE CONFIRMACIÓN */}
      {pedidoAConfirmar && (() => {
        const { numeroMesa, esParaLlevar, mesera, especificaciones, adicionales } = desglosarCabeceraPedido(pedidoAConfirmar.mesa);

        return (
          <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col space-y-4 text-left animate-in zoom-in-95 duration-200 text-white">
              
              <div className="flex items-center space-x-3 text-amber-500 border-b border-slate-700 pb-3">
                <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
                <div>
                  <h3 className="text-base font-black tracking-tight">¿Confirmar despacho de pedido?</h3>
                  <p className="text-xs text-slate-400 font-medium">Revisa los componentes del pedido antes de sacarlo</p>
                </div>
              </div>

              {/* Cabecera del Pedido Dinámica */}
              <div className="bg-slate-900 rounded-xl p-3 border border-slate-750 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">
                    {esParaLlevar ? 'Cliente' : 'Ubicación'}
                  </span>
                  <span className="text-base font-black text-white uppercase tracking-wide">
                    {esParaLlevar ? numeroMesa : `Mesa ${numeroMesa}`}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Mesera</span>
                  <span className="text-xs font-bold text-emerald-400 uppercase">{mesera}</span>
                </div>
              </div>

              {/* Detalles de la Orden Inyectados */}
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen de platos</p>
                <div className="space-y-1.5">
                  {pedidoAConfirmar.detalles_pedido?.map((det, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs bg-slate-900/50 p-2 rounded-lg border border-slate-750">
                      <span className="font-bold text-slate-200 capitalize">{det.platos?.nombre}</span>
                      <span className="bg-emerald-500/10 text-emerald-400 font-black px-2 py-0.5 rounded">x{det.cantidad}</span>
                    </div>
                  ))}
                </div>

                {/* Adicionales dentro del Modal */}
                {adicionales && adicionales.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] font-black text-sky-400 uppercase tracking-widest">Notas / Adicionales:</p>
                    {adicionales.map((item, index) => (
                      <div key={index} className="bg-sky-950/40 border border-sky-900/40 p-2 rounded-lg text-xs font-bold text-sky-300 capitalize">
                        ➕ {item}
                      </div>
                    ))}
                  </div>
                )}

                {/* Especificaciones / Notas si existen */}
                {especificaciones.length > 0 && (
                  <div className="mt-2 bg-slate-900/40 rounded-xl p-2.5 border border-slate-750/60 space-y-1">
                    {especificaciones.map((item, index) => (
                      <p key={index} className="text-[11px] text-amber-100/90 font-medium capitalize pl-2 border-l-2 border-amber-500/40">
                        {item}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Botonera */}
              <div className="flex items-center gap-3 pt-2 font-bold text-xs uppercase border-t border-slate-700/60">
                <button 
                  onClick={() => setPedidoAConfirmar(null)}
                  className="w-1/2 border border-slate-700 text-slate-300 py-3 rounded-xl hover:bg-slate-750 transition"
                >
                  Cancelar
                </button>
                <button 
                  onClick={ejecutarDespacho}
                  className="w-1/2 bg-emerald-600 text-white py-3 rounded-xl hover:bg-emerald-700 shadow-md transition"
                >
                  Sí, Despachar Pedido
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}

function templatesTexto(spec: string[]) {
  return spec.map((item, index) => (
    <p key={index} className="text-xs text-amber-100/90 font-bold capitalize leading-relaxed pl-2.5 border-l-2 border-amber-500/40">
      {item}
    </p>
  ));
}