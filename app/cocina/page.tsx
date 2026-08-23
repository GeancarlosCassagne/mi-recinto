'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle, Clock, User, Bike, UtensilsCrossed, AlertCircle, AlertTriangle, Lock, Trash2, DollarSign, Utensils, Soup, Drumstick, Coffee, Tag, Check } from 'lucide-react';

interface DetallePedido {
  cantidad: number;
  precio_unitario: number;
  platos: { nombre: string; precio: number };
}

interface Pedido {
  id: string;
  mesa: string;
  total: number;
  estado: string;
  created_at: string;
  detalles_pedido: DetallePedido[];
}

export default function CocinaPage() {
  const [autenticado, setAutenticado] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [errorPass, setErrorPass] = useState(false);
  const CLAVE_ACCESO = '5678';

  const validarAcceso = (e: React.FormEvent) => {
    e.preventDefault();
    if (passInput === CLAVE_ACCESO) {
      setAutenticado(true);
      setErrorPass(false);
    } else {
      setErrorPass(true);
      setPassInput('');
    }
  };

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidoAConfirmar, setPedidoAConfirmar] = useState<Pedido | null>(null);
  const [pedidoAEliminar, setPedidoAEliminar] = useState<{ id: string; mesa: string; total: number } | null>(null);
  const [eliminando, setEliminando] = useState(false);
  
  // 🟢 ESTADO PARA GUARDAR ÍTEMS TACHADOS INTERACTIVAMENTE EN COCINA
  const [tachados, setTachados] = useState<Record<string, boolean>>({});

  const alternarTachado = (claveUnica: string) => {
    setTachados(prev => ({
      ...prev,
      [claveUnica]: !prev[claveUnica]
    }));
  };

  const obtenerPedidosDelDia = async () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    const hoyLocal = new Date(d.getTime() - offset).toISOString().split('T')[0];
    
    const { data } = await supabase
      .from('pedidos')
      .select('id, mesa, total, estado, created_at, detalles_pedido (cantidad, precio_unitario, platos (nombre, precio))')
      .in('estado', ['pendiente', 'entregado'])
      .gte('created_at', `${hoyLocal} 00:00:00`)
      .lte('created_at', `${hoyLocal} 23:59:59`)
      .order('created_at', { ascending: true });

    if (data) setPedidos(data as unknown as Pedido[]);
  };

  useEffect(() => {
    obtenerPedidosDelDia();
    
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

  const ejecutarEliminarPedido = async () => {
    if (!pedidoAEliminar) return;
    setEliminando(true);

    try {
      await supabase.from('detalles_pedido').delete().eq('pedido_id', pedidoAEliminar.id);
      await supabase.from('pedidos').delete().eq('id', pedidoAEliminar.id);
      
      setPedidoAEliminar(null);
      obtenerPedidosDelDia();
    } catch (error) {
      console.error(error);
      alert('Hubo un error al intentar eliminar la comanda.');
    } finally {
      setEliminando(false);
    }
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
      especificaciones = parteEspecificaciones
        .split(/,|\|/)
        .map(s => s.trim())
        .filter(Boolean);
    }
    
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

  // 🟢 Clasificador con precios fijos y TONGA SIN RECARGO
  const clasificarItemsComanda = (especificaciones: string[], detalles: DetallePedido[], esParaLlevar: boolean) => {
    const completos: { texto: string; cantidad: string; precio: number }[] = [];
    const segundos: { texto: string; cantidad: string; precio: number }[] = [];
    const caldos: { texto: string; cantidad: string; precio: number }[] = [];
    const bebidasYExtras: { texto: string; cantidad: string; precio: number }[] = [];

    if (especificaciones.length > 0) {
      especificaciones.forEach(item => {
        const partes = item.trim().split(/\s+(.+)/);
        const tieneCantidad = partes[0] && partes[0].match(/^\d+x$/i);
        const cantidadStr = tieneCantidad ? partes[0].toUpperCase() : '1X';
        const cantidadNum = tieneCantidad ? parseInt(partes[0].replace(/x/i, ''), 10) : 1;
        const textoDetalle = tieneCantidad ? partes[1] : item;

        const textoMin = textoDetalle.toLowerCase();
        let precioCalculado = 0;

        if (textoMin.includes('completo:')) {
          precioCalculado = (esParaLlevar ? 3.25 : 3.00) * cantidadNum;
          completos.push({ texto: textoDetalle, cantidad: cantidadStr, precio: precioCalculado });
        } else if (textoMin.includes('solo segundo:')) {
          precioCalculado = (esParaLlevar ? 2.75 : 2.50) * cantidadNum;
          segundos.push({ texto: textoDetalle, cantidad: cantidadStr, precio: precioCalculado });
        } else if (textoMin.includes('solo caldo:')) {
          precioCalculado = (esParaLlevar ? 1.75 : 1.50) * cantidadNum;
          caldos.push({ texto: textoDetalle, cantidad: cantidadStr, precio: precioCalculado });
        } else if (textoMin.includes('tonga')) {
          const esGranja = textoMin.includes('granja');
          // Tonga NO tiene recargo en llevar
          const baseTonga = esGranja ? 2.75 : 5.00;
          precioCalculado = baseTonga * cantidadNum;
          segundos.push({ texto: textoDetalle, cantidad: cantidadStr, precio: precioCalculado });
        } else if (textoMin.includes('caldo criollo')) {
          precioCalculado = (esParaLlevar ? 5.25 : 5.00) * cantidadNum;
          caldos.push({ texto: textoDetalle, cantidad: cantidadStr, precio: precioCalculado });
        } else if (textoMin.includes('seco criollo')) {
          precioCalculado = (esParaLlevar ? 5.25 : 5.00) * cantidadNum;
          segundos.push({ texto: textoDetalle, cantidad: cantidadStr, precio: precioCalculado });
        } else {
          const det = detalles?.find(d => textoDetalle.toLowerCase().includes(d.platos?.nombre.toLowerCase()));
          const precioUnit = Number(det?.precio_unitario || det?.platos?.precio || 0);
          segundos.push({ texto: textoDetalle, cantidad: cantidadStr, precio: precioUnit * cantidadNum });
        }
      });

      detalles?.filter(d => {
        const n = d.platos?.nombre.toLowerCase();
        return !n.includes('tonga') && !n.includes('almuerzo') && !n.includes('hornado') && !n.includes('seco criollo') && !n.includes('caldo criollo');
      }).forEach(d => {
        bebidasYExtras.push({
          texto: d.platos?.nombre,
          cantidad: `x${d.cantidad}`,
          precio: Number(d.precio_unitario || d.platos?.precio || 0) * d.cantidad
        });
      });

    } else {
      detalles?.forEach(d => {
        const n = d.platos?.nombre.toLowerCase();
        const itemObj = {
          texto: d.platos?.nombre,
          cantidad: `x${d.cantidad}`,
          precio: Number(d.precio_unitario || d.platos?.precio || 0) * d.cantidad
        };

        if (n.includes('caldo') || n.includes('sopa')) {
          caldos.push(itemObj);
        } else if (n.includes('jugo') || n.includes('cola') || n.includes('agua') || n.includes('bebida') || n.includes('chicha') || n.includes('quaker')) {
          bebidasYExtras.push(itemObj);
        } else {
          segundos.push(itemObj);
        }
      });
    }

    return { completos, segundos, caldos, bebidasYExtras };
  };

  // 🟢 Renderizado con soporte para tachar individualmente
  const renderItemTextoLimpio = (texto: string, pedidoId: string, idxGeneral: number | string) => {
    let titulo = texto;
    let componentes: string[] = [];

    let textoLimpio = texto
      .replace(/Almuerzo Del Día/gi, '')
      .replace(/\(\(/g, '(')
      .replace(/\)\)/g, ')')
      .trim();

    const regexAlmuerzo = /\((Completo|Solo Segundo|Solo Caldo):\s*(.*?)\)$/i;
    const match = textoLimpio.match(regexAlmuerzo);

    if (match) {
      const tipo = match[1].toLowerCase();
      titulo = tipo === 'completo' ? 'Almuerzo Completo' : tipo === 'solo segundo' ? 'Solo Segundo' : 'Solo Caldo';
      
      componentes = match[2]
        .split('+')
        .map(s => s.trim())
        .filter(Boolean);
    } else {
      titulo = textoLimpio;
    }

    const claveTitulo = `${pedidoId}-tit-${idxGeneral}`;
    const estaTachadoTitulo = !!tachados[claveTitulo];

    return (
      <div className="flex-1 min-w-0">
        <p 
          onClick={() => alternarTachado(claveTitulo)}
          className={`font-extrabold text-xs capitalize leading-tight cursor-pointer select-none transition-all ${
            estaTachadoTitulo ? 'line-through text-slate-500 opacity-50' : 'text-white hover:text-emerald-300'
          }`}
          title="Click para tachar / destachar"
        >
          {titulo}
        </p>

        {componentes.length > 0 && (
          <div className="mt-1 space-y-0.5 pl-1 border-l-2 border-slate-700">
            {componentes.map((comp, i) => {
              const claveComp = `${pedidoId}-sub-${idxGeneral}-${i}`;
              const estaTachadoComp = !!tachados[claveComp];

              return (
                <p 
                  key={i} 
                  onClick={() => alternarTachado(claveComp)}
                  className={`text-[11px] font-medium capitalize flex items-center gap-1.5 cursor-pointer select-none transition-all ${
                    estaTachadoComp ? 'line-through text-slate-600 opacity-50' : 'text-slate-300 hover:text-emerald-300'
                  }`}
                  title="Click para tachar componente"
                >
                  <span className={`text-[10px] ${estaTachadoComp ? 'text-slate-600' : 'text-emerald-400'}`}>•</span>
                  <span>{comp}</span>
                </p>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 w-full relative">

      {/* BANNER DE BLOQUEO COCINA */}
      {!autenticado && (
        <div className="fixed inset-0 bg-slate-950/90 z-[200] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6 text-white">
            <div className="w-16 h-16 bg-blue-900/40 text-blue-400 rounded-2xl flex items-center justify-center mx-auto border border-blue-800/50 shadow-inner">
              <Lock className="h-8 w-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black text-white tracking-tight">Acceso de Cocina</h2>
              <p className="text-xs text-slate-400 font-medium">
                Estás intentando ingresar a la interfaz de <br/>
                <strong className="text-blue-400 font-black uppercase text-sm">"Monitor de Cocina"</strong>
              </p>
            </div>

            <form onSubmit={validarAcceso} className="space-y-4">
              <div>
                <input 
                  type="password" 
                  value={passInput} 
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="Ingresa la contraseña de cocina..."
                  className={`w-full border rounded-2xl p-3.5 text-center font-bold text-sm outline-none transition-all ${
                    errorPass ? 'border-red-500 bg-red-950/50 text-red-200 focus:ring-2 focus:ring-red-500' : 'border-slate-700 bg-slate-950 text-white focus:border-blue-500'
                  }`}
                  autoFocus
                />
                {errorPass && <p className="text-[11px] font-bold text-red-400 mt-2">Contraseña incorrecta.</p>}
              </div>

              <button 
                type="submit" 
                className="w-full bg-blue-600 text-white font-extrabold text-xs uppercase py-4 rounded-2xl shadow-md hover:bg-blue-700 transition tracking-wider"
              >
                Acceder a Comandas
              </button>
            </form>
          </div>
        </div>
      )}

      <header className="border-b border-slate-800 pb-4 mb-6 flex justify-between items-center max-w-7xl mx-auto">
        <h1 className="text-2xl font-black tracking-tight text-slate-100 flex items-center gap-2">
          🍳 Monitor de Cocina <span className="text-emerald-400 font-medium text-sm bg-emerald-950/60 px-3 py-1 rounded-xl border border-emerald-900/50">Flujo General Diario</span>
        </h1>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Toca cualquier ítem para tacharlo</p>
      </header>

      {pedidos.length === 0 ? (
        <div className="h-[70vh] flex flex-col items-center justify-center text-slate-500 italic text-sm">
          <Clock className="h-10 w-10 text-slate-700 mb-2 animate-pulse" />
          <span>No se registran pedidos en el sistema para el día de hoy.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {pedidos.map((p) => {
            const { numeroMesa, esParaLlevar, mesera, especificaciones, adicionales } = desglosarCabeceraPedido(p.mesa);
            const { completos, segundos, caldos, bebidasYExtras } = clasificarItemsComanda(especificaciones, p.detalles_pedido, esParaLlevar);
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
                      <span>¡Para Llevar!</span>
                    </div>
                  ) : (
                    <div className="bg-emerald-600 text-white font-black text-sm uppercase px-4 py-3 tracking-wider flex items-center justify-center gap-2 shadow-inner">
                      <UtensilsCrossed className="h-5 w-5 stroke-[3]" />
                      <span>Para Servirse en Mesa</span>
                    </div>
                  )}

                  {/* CABECERA */}
                  <div className={`p-4 border-b border-slate-700/50 flex justify-between items-center ${estaDespachado ? 'bg-slate-900/20' : 'bg-slate-800/40'}`}>
                    <div>
                      <h2 className={`text-xl font-black tracking-tight uppercase ${estaDespachado ? 'text-slate-400 line-through' : 'text-white'}`}>
                        {esParaLlevar ? `Cliente: ${numeroMesa}` : `Mesa ${numeroMesa}`}
                      </h2>
                      <span className="text-[10px] bg-slate-700 text-slate-300 font-bold px-2 py-0.5 rounded-md uppercase mt-1 inline-flex items-center gap-1">
                        <User className="h-2.5 w-2.5" /> {mesera}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-slate-900 px-2.5 py-1.5 rounded-xl text-slate-400 font-mono font-bold flex items-center gap-1 border border-slate-700/60">
                        <Clock className="h-3.5 w-3.5 text-amber-500" /> {hora}
                      </span>
                      <button
                        onClick={() => setPedidoAEliminar({ id: p.id, mesa: numeroMesa, total: Number(p.total) })}
                        className="p-1.5 bg-red-950/40 border border-red-800/60 text-red-400 hover:text-white hover:bg-red-600 rounded-xl transition"
                        title="Eliminar comanda"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* CUERPO: 1° CALDOS -> 2° SEGUNDOS -> 3° COMPLETOS -> 4° BEBIDAS -> 5° ADICIONALES */}
                  <div className="p-4 space-y-3.5">

                    {/* 🟢 1. CASILLERO AZUL: CALDOS Y SOPAS (PRIMERO EN SALIR) */}
                    {caldos.length > 0 && (
                      <div className="space-y-1.5 bg-blue-950/30 border border-blue-700/60 p-2.5 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-1.5 text-cyan-300 font-black text-[11px] uppercase tracking-wider border-b border-blue-700/50 pb-1">
                          <Soup className="h-3.5 w-3.5 text-cyan-400" />
                          <span>1. Caldos y Sopas</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          {caldos.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start text-xs bg-blue-950/70 border border-blue-600/40 p-2.5 rounded-xl text-slate-100 shadow-sm gap-2">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <span className="bg-cyan-500 text-slate-950 font-black px-2 py-0.5 rounded-md text-[11px] shrink-0 mt-0.5">
                                  {item.cantidad}
                                </span>
                                {renderItemTextoLimpio(item.texto, p.id, `caldo-${idx}`)}
                              </div>
                              {item.precio > 0 && (
                                <span className="font-mono font-black text-xs text-cyan-300 shrink-0 mt-0.5">
                                  ${item.precio.toFixed(2)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 🟢 2. CASILLERO ÁMBAR: SEGUNDOS, FUERTES Y TONGAS */}
                    {segundos.length > 0 && (
                      <div className="space-y-1.5 bg-amber-950/30 border border-amber-700/60 p-2.5 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-1.5 text-amber-300 font-black text-[11px] uppercase tracking-wider border-b border-amber-700/50 pb-1">
                          <Drumstick className="h-3.5 w-3.5 text-amber-400" />
                          <span>2. Segundos / Fuertes / Tongas</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          {segundos.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start text-xs bg-amber-950/70 border border-amber-600/40 p-2.5 rounded-xl text-slate-100 shadow-sm gap-2">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <span className="bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded-md text-[11px] shrink-0 mt-0.5">
                                  {item.cantidad}
                                </span>
                                {renderItemTextoLimpio(item.texto, p.id, `segundo-${idx}`)}
                              </div>
                              {item.precio > 0 && (
                                <span className="font-mono font-black text-xs text-amber-300 shrink-0 mt-0.5">
                                  ${item.precio.toFixed(2)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 🟢 3. CASILLERO VERDE: ALMUERZOS COMPLETOS */}
                    {completos.length > 0 && (
                      <div className="space-y-1.5 bg-emerald-950/30 border border-emerald-700/60 p-2.5 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-1.5 text-emerald-300 font-black text-[11px] uppercase tracking-wider border-b border-emerald-700/50 pb-1">
                          <Utensils className="h-3.5 w-3.5 text-emerald-400" />
                          <span>3. Almuerzos Completos</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          {completos.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-start text-xs bg-emerald-950/70 border border-emerald-600/40 p-2.5 rounded-xl text-slate-100 shadow-sm gap-2">
                              <div className="flex items-start gap-2 min-w-0 flex-1">
                                <span className="bg-emerald-500 text-slate-950 font-black px-2 py-0.5 rounded-md text-[11px] shrink-0 mt-0.5">
                                  {item.cantidad}
                                </span>
                                {renderItemTextoLimpio(item.texto, p.id, `completo-${idx}`)}
                              </div>
                              {item.precio > 0 && (
                                <span className="font-mono font-black text-xs text-emerald-300 shrink-0 mt-0.5">
                                  ${item.precio.toFixed(2)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 🟢 4. CASILLERO VIOLETA: BEBIDAS Y EXTRAS */}
                    {bebidasYExtras.length > 0 && (
                      <div className="space-y-1.5 bg-purple-950/30 border border-purple-700/60 p-2.5 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-1.5 text-purple-300 font-black text-[11px] uppercase tracking-wider border-b border-purple-700/50 pb-1">
                          <Coffee className="h-3.5 w-3.5 text-purple-400" />
                          <span>4. Bebidas / Extras Sueltos</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          {bebidasYExtras.map((item, idx) => {
                            const claveBebida = `${p.id}-bebida-${idx}`;
                            const estaTachada = !!tachados[claveBebida];

                            return (
                              <div key={idx} className="flex justify-between items-center text-xs bg-purple-950/70 border border-purple-600/40 p-2.5 rounded-xl shadow-sm">
                                <span 
                                  onClick={() => alternarTachado(claveBebida)}
                                  className={`font-bold capitalize cursor-pointer select-none transition-all ${
                                    estaTachada ? 'line-through text-slate-500 opacity-50' : 'text-slate-200 hover:text-purple-300'
                                  }`}
                                  title="Click para tachar"
                                >
                                  • {item.texto}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="bg-purple-500 text-slate-950 font-black px-2 py-0.5 rounded-md text-[11px]">{item.cantidad}</span>
                                  <span className="font-mono font-black text-xs text-purple-300">${item.precio.toFixed(2)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 🟢 5. CASILLERO ROSA: NOTAS Y ADICIONALES */}
                    {adicionales && adicionales.length > 0 && (
                      <div className="space-y-1.5 bg-rose-950/30 border border-rose-800/60 p-2.5 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-1.5 text-rose-300 font-black text-[11px] uppercase tracking-wider border-b border-rose-800/50 pb-1">
                          <Tag className="h-3.5 w-3.5 text-rose-400" />
                          <span>5. Notas y Adicionales</span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          {adicionales.map((item, index) => {
                            const claveExtra = `${p.id}-extra-${index}`;
                            const estaTachadoExtra = !!tachados[claveExtra];

                            return (
                              <div key={index} className="bg-rose-950/70 border border-rose-700/40 p-2.5 rounded-xl text-xs font-bold text-rose-200 capitalize flex items-center gap-2 shadow-sm">
                                <span className="bg-rose-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                                  Adicional:
                                </span>
                                <span 
                                  onClick={() => alternarTachado(claveExtra)}
                                  className={`truncate cursor-pointer select-none transition-all ${
                                    estaTachadoExtra ? 'line-through text-slate-500 opacity-50' : 'hover:text-rose-100'
                                  }`}
                                  title="Click para tachar"
                                >
                                  {item}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* TOTAL */}
                    <div className="mt-2 pt-2 border-t border-slate-700/80 flex justify-between items-center bg-slate-900/80 p-2.5 rounded-xl border border-slate-700/60">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400">Total a Cobrar:</span>
                      <span className="text-base font-black text-emerald-400 font-mono flex items-center">
                        <DollarSign className="h-4 w-4" />{Number(p.total).toFixed(2)}
                      </span>
                    </div>

                  </div>
                </div>

                {/* BOTÓN DESPACHAR */}
                <div className="p-4 bg-slate-800/80 border-t border-slate-700/40">
                  {estaDespachado ? (
                    <div className="w-full bg-slate-900 text-slate-500 font-bold text-xs uppercase py-3 rounded-xl text-center border border-slate-800 flex items-center justify-center gap-1.5">
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

      {/* MODAL CONFIRMAR DESPACHO */}
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

              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {especificaciones.length > 0 ? (
                  especificaciones.map((item, idx) => (
                    <p key={idx} className="text-xs text-amber-100 font-bold capitalize bg-slate-900/60 p-2 rounded-lg border border-slate-700 break-words">
                      • {item}
                    </p>
                  ))
                ) : (
                  pedidoAConfirmar.detalles_pedido?.map((det, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs bg-slate-900/50 p-2 rounded-lg border border-slate-750">
                      <span className="font-bold text-slate-200 capitalize">{det.platos?.nombre}</span>
                      <span className="bg-emerald-500/10 text-emerald-400 font-black px-2 py-0.5 rounded">x{det.cantidad}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-slate-700/60 pt-3 flex justify-between items-center font-black text-sm">
                <span className="text-slate-400 uppercase text-xs">Total:</span>
                <span className="text-emerald-400 font-mono text-base">${Number(pedidoAConfirmar.total).toFixed(2)}</span>
              </div>

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
                  Sí, Despachar
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* MODAL CONFIRMAR ELIMINACIÓN */}
      {pedidoAEliminar && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4 text-left animate-in zoom-in-95 duration-200 text-white">
            <div className="flex items-center space-x-3 text-red-400">
              <div className="p-2 bg-red-950/50 rounded-xl border border-red-900/50">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">¿Eliminar Comanda?</h3>
                <p className="text-xs text-slate-400 font-medium">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700 text-xs text-slate-300 space-y-1">
              <p>Mesa / Cliente: <strong className="text-white font-black uppercase text-sm block">{pedidoAEliminar.mesa}</strong></p>
              <p>Monto: <strong className="text-emerald-400 font-mono font-bold">${pedidoAEliminar.total.toFixed(2)}</strong></p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 font-bold text-xs uppercase">
              <button
                type="button"
                onClick={() => setPedidoAEliminar(null)}
                disabled={eliminando}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 py-3 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarEliminarPedido}
                disabled={eliminando}
                className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-xl transition shadow-lg shadow-red-950/40"
              >
                {eliminando ? 'Borrando...' : 'Sí, Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}