'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PlusCircle, DollarSign, Calendar, ClipboardList, Lock, Unlock, X, Plus, Trash2, CheckSquare, Square, User, Eye, EyeOff } from 'lucide-react';

interface Plato {
  id: string;
  nombre: string;
  precio: number;
  disponible: boolean;
  categoria: string;
}

interface DetallePedido {
  cantidad: number;
  platos: { nombre: string };
}

interface Pedido {
  id: string;
  mesa: string;
  total: number;
  estado: string;
  created_at: string;
  detalles_pedido: DetallePedido[];
}

export default function AdminPage() {
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [platosSeleccionados, setPlatosSeleccionados] = useState<string[]>([]);
  const [pedidosDia, setPedidosDia] = useState<Pedido[]>([]);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [categoria, setCategoria] = useState('segundo');
  const [cargando, setCargando] = useState(false);
  
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(new Date().toISOString().split('T')[0]);
  const [estadoCaja, setEstadoCaja] = useState<'abierta' | 'cerrada'>('abierta');
  const [verDetalleModal, setVerDetalleModal] = useState(false);

  const obtenerPlatos = async () => {
    const { data, error } = await supabase
      .from('platos')
      .select('id, nombre, precio, disponible, categoria')
      .order('nombre', { ascending: true });
    if (!error && data) setPlatos(data as Plato[]);
  };

  const obtenerMenuDelDia = async (fecha: string) => {
    const { data } = await supabase.from('menu_diario').select('plato_id').eq('fecha', fecha);
    if (data) {
      setPlatosSeleccionados(data.map(m => m.plato_id));
    } else {
      setPlatosSeleccionados([]);
    }
  };

  const cargarDatosDelDia = async (fecha: string) => {
    const { data: datosCaja } = await supabase.from('cajas').select('estado').eq('fecha', fecha).maybeSingle();
    setEstadoCaja(datosCaja?.estado || 'abierta');

    const { data: datosPedidos } = await supabase
      .from('pedidos')
      .select(`id, mesa, total, estado, created_at, detalles_pedido (cantidad, platos (nombre))`)
      .gte('created_at', `${fecha} 00:00:00`)
      .lte('created_at', `${fecha} 23:59:59`)
      .order('created_at', { ascending: false });

    if (datosPedidos) {
      setPedidosDia(datosPedidos as unknown as Pedido[]);
    } else {
      setPedidosDia([]);
    }
  };

  useEffect(() => {
    obtenerPlatos();
    obtenerMenuDelDia(fechaSeleccionada);
    cargarDatosDelDia(fechaSeleccionada);
  }, [fechaSeleccionada]);

  const guardarPlato = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !precio.trim()) return alert('Campos obligatorios.');
    const precioNumerico = parseFloat(precio);
    if (isNaN(precioNumerico) || precioNumerico <= 0) return alert('Precio inválido.');

    setCargando(true);
    try {
      const { error } = await supabase.from('platos').insert([
        { nombre: nombre.trim(), precio: precioNumerico, disponible: true, categoria: categoria }
      ]);
      if (error) throw error;
      setNombre(''); setPrecio(''); setCategoria('segundo');
      alert('¡Plato agregado con éxito!');
      obtenerPlatos();
    } catch (err) {
      alert('Error al guardar el plato.');
    } finally { setCargando(false); }
  };

  const alternarDisponibilidad = async (id: string, estadoActual: boolean) => {
    const { error } = await supabase
      .from('platos')
      .update({ disponible: !estadoActual })
      .eq('id', id);
      
    if (!error) obtenerPlatos();
  };

  const cambiarCategoriaPlato = async (id: string, nuevaCategoria: string) => {
    const { error } = await supabase
      .from('platos')
      .update({ categoria: nuevaCategoria })
      .eq('id', id);

    if (!error) {
      obtenerPlatos();
    } else {
      alert('No se pudo actualizar la categoría.');
    }
  };

  const eliminarPlato = async (id: string, nombrePlato: string) => {
    const seguro = confirm(`¿Estás seguro de que deseas eliminar permanentemente el plato "${nombrePlato}" del Banco General?`);
    if (!seguro) return;

    try {
      const { error } = await supabase
        .from('platos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPlatosSeleccionados(prev => prev.filter(pId => pId !== id));
      obtenerPlatos();
    } catch (err: any) {
      console.error(err);
      alert('No se pudo eliminar el plato.');
    }
  };

  const esPlatoFijoInmutable = (nombrePlato: string, catPlato: string) => {
    const n = nombrePlato.toLowerCase();
    return catPlato === 'fijo' || 
           catPlato === 'tonga_gallina' ||
           catPlato === 'tonga_presa' ||
           n.includes('tonga') || 
           n.includes('almuerzo del día') || 
           n.includes('cola pequeña') || 
           n.includes('cola grande') || 
           n.includes('botella de agua');
  };

  const alternarSeleccionPlato = (id: string, nombrePlato: string, catPlato: string) => {
    if (esPlatoFijoInmutable(nombrePlato, catPlato)) return;

    if (platosSeleccionados.includes(id)) {
      setPlatosSeleccionados(platosSeleccionados.filter(pId => pId !== id));
    } else {
      setPlatosSeleccionados([...platosSeleccionados, id]);
    }
  };

  const guardarMenuDiario = async () => {
    setCargando(true);
    
    let listaFinal = [...platosSeleccionados];
    platos.forEach(p => {
      if (esPlatoFijoInmutable(p.nombre, p.categoria) && !listaFinal.includes(p.id)) {
        listaFinal.push(p.id);
      }
    });

    await supabase.from('menu_diario').delete().eq('fecha', fechaSeleccionada);

    if (listaFinal.length > 0) {
      const filasAInsertar = listaFinal.map(id => ({ fecha: fechaSeleccionada, plato_id: id }));
      const { error } = await supabase.from('menu_diario').insert(filasAInsertar);
      if (error) {
        alert('Error al actualizar el menú diario.');
        setCargando(false);
        return;
      }
    }

    alert('¡Menú guardado con éxito!');
    obtenerMenuDelDia(fechaSeleccionada);
    setCargando(false);
  };

  const manejarCierreCaja = async () => {
    const nuevoEstado = estadoCaja === 'abierta' ? 'cerrada' : 'abierta';
    await supabase.from('cajas').upsert({ fecha: fechaSeleccionada, estado: nuevoEstado, cerrado_at: nuevoEstado === 'cerrada' ? new Date().toISOString() : null }, { onConflict: 'fecha' });
    setEstadoCaja(nuevoEstado);
  };

  const procesarMesaCompleta = (textoMesa: string) => {
    let numeroMesa = textoMesa; let nombreMesera = 'No especificada'; let listaExtras: string[] = [];
    if (textoMesa.includes('[MESERA:')) {
      numeroMesa = textoMesa.split('[MESERA:')[0].trim();
      nombreMesera = textoMesa.split('[MESERA:')[1].split(']')[0].trim();
    }
    if (numeroMesa.includes('[EXTRA:')) numeroMesa = numeroMesa.split('[EXTRA:')[0].trim();
    if (textoMesa.includes('[EXTRA:')) {
      textoMesa.substring(textoMesa.indexOf('[EXTRA:') + 7).replace(']', '').split('|').forEach(seg => {
        const limpio = seg.replace('Especificaciones:', '').trim();
        if (limpio) listaExtras.push(limpio);
      });
    }
    return { numeroMesa, nombreMesera, listaExtras };
  };

  const totalRecaudado = pedidosDia.filter(p => p.estado === 'entregado').reduce((acc, p) => acc + Number(p.total), 0);

  // Filtramos la lista principal eliminando los componentes específicos internos de la Tonga
  const platosPlanificadorVisibles = platos.filter(p => p.categoria !== 'tonga_gallina' && p.categoria !== 'tonga_presa');
  const componentesTongaInternos = platos.filter(p => p.categoria === 'tonga_gallina' || p.categoria === 'tonga_presa');

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-6 grid grid-cols-1 md:grid-cols-3 gap-8 w-full text-gray-900 max-w-7xl mx-auto">
      
      {/* HEADER DE CONTROL */}
      <div className="md:col-span-3 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <Calendar className="h-5 w-5 text-emerald-700" />
          <input type="date" value={fechaSeleccionada} onChange={(e) => setFechaSeleccionada(e.target.value)} className="border border-gray-200 rounded-xl p-2.5 text-sm font-bold bg-white outline-none focus:ring-2 focus:ring-emerald-700" />
        </div>
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl px-6 py-3 text-center sm:text-right min-w-[220px]">
          <span className="text-[10px] font-bold text-emerald-800 uppercase block mb-0.5">Ventas del Día ({fechaSeleccionada})</span>
          <span className="text-2xl font-black text-emerald-900 flex items-center justify-center sm:justify-end"><DollarSign className="h-6 w-6" />{totalRecaudado.toFixed(2)}</span>
          <button onClick={() => setVerDetalleModal(true)} className="text-xs font-bold text-emerald-700 underline hover:text-emerald-800">Ver desglose de este día</button>
        </div>
        <button onClick={manejarCierreCaja} className={`w-full sm:w-auto font-bold text-xs uppercase px-6 py-3.5 rounded-xl text-white ${estadoCaja === 'abierta' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-800'}`}>{estadoCaja === 'abierta' ? 'Finalizar Jornada' : 'Habilitar Jornada'}</button>
      </div>

      {/* FORMULARIO ADICIÓN PLATO */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 h-fit shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-bold pb-4 border-b mb-5 flex items-center gap-2"><PlusCircle className="text-emerald-700 h-5 w-5" /> Registrar Plato Base</h2>
          <form onSubmit={guardarPlato} className="space-y-4">
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Nombre del Plato</label><input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full border rounded-xl p-2.5 text-sm bg-white outline-none focus:border-emerald-700" placeholder="Ej. Ceviche" /></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1">Precio Unitario (USD)</label><input type="text" value={precio} onChange={(e) => setPrecio(e.target.value)} className="w-full border rounded-xl p-2.5 text-sm bg-white outline-none focus:border-emerald-700" placeholder="Ej. 5.00" /></div>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Tipo / Categoría de Plato</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full border border-gray-200 rounded-xl p-2.5 text-sm bg-white outline-none focus:border-emerald-700 font-medium text-gray-800">
                <option value="segundo">🥩 Segundo (Plato Fuerte)</option>
                <option value="caldo">🥣 Caldo / Sopa</option>
                <option value="fijo">🥤 Fijo (Tonga, Almuerzo del Día, Bebidas)</option>
              </select>
            </div>

            <button type="submit" className="w-full bg-emerald-700 text-white font-bold text-sm py-3 rounded-xl shadow-sm hover:bg-emerald-800 transition">Guardar en Banco General</button>
          </form>
        </div>

        {/* NUEVO APARTADO: CONTROL DISPONIBILIDAD INGREDIENTES TONGA */}
        <div className="border-t pt-5">
          <h3 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-3">Disponibilidad de Tonga</h3>
          <div className="bg-slate-50 rounded-xl p-3 border space-y-2 max-h-[220px] overflow-y-auto">
            {componentesTongaInternos.map((comp) => (
              <div key={comp.id} className="flex justify-between items-center text-xs p-2 bg-white rounded-lg border shadow-sm">
                <div>
                  <p className="font-bold text-gray-900 capitalize">{comp.nombre}</p>
                  <span className="text-[9px] text-gray-400 font-medium block">{comp.categoria === 'tonga_gallina' ? '🐓 Tipo Gallina' : '🍗 Presa'}</span>
                </div>
                <button 
                  type="button"
                  onClick={() => alternarDisponibilidad(comp.id, comp.disponible)}
                  className={`p-1.5 rounded-lg border flex items-center justify-center transition-all ${
                    comp.disponible ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                  }`}
                >
                  {comp.disponible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PLANIFICADOR MENÚ DIARIO */}
      <div className="md:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex justify-between border-b pb-4 mb-4 items-center">
            <h2 className="text-lg font-bold">Planificador del Menú del Día</h2>
            <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-2.5 py-1 rounded-md uppercase">Índice Activo</span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto pr-1 pb-3 px-2">
            {platosPlanificadorVisibles.map((plato) => {
              const esFijo = esPlatoFijoInmutable(plato.nombre, plato.categoria);
              const marcado = esFijo || platosSeleccionados.includes(plato.id);

              return (
                <div key={plato.id} className="py-3.5 px-3 flex justify-between items-center hover:bg-gray-50/80 transition-all rounded-xl gap-4">
                  <div className="flex items-center space-x-3.5 flex-1 min-w-0">
                    <button 
                      type="button"
                      onClick={() => alternarSeleccionPlato(plato.id, plato.nombre, plato.categoria)} 
                      className="flex items-center justify-center text-gray-400 hover:text-emerald-700 transition-colors focus:outline-none shrink-0"
                    >
                      {marcado ? (
                        <CheckSquare className={`h-5 w-5 ${esFijo ? 'text-gray-300' : 'text-emerald-700'}`} />
                      ) : (
                        <Square className="h-5 w-5 text-gray-300" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm capitalize text-gray-950 truncate">{plato.nombre}</h4>
                      <div className="mt-1 flex items-center space-x-1">
                        <select 
                          value={plato.categoria || 'segundo'} 
                          onChange={(e) => cambiarCategoriaPlato(plato.id, e.target.value)}
                          className="text-[11px] font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded-lg px-1.5 py-0.5 outline-none focus:border-emerald-600 transition"
                        >
                          <option value="segundo">🥩 Segundo</option>
                          <option value="caldo">🥣 Caldo</option>
                          <option value="fijo">🥤 Fijo</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 shrink-0">
                    <button 
                      type="button"
                      onClick={() => alternarDisponibilidad(plato.id, plato.disponible)}
                      className={`p-2 rounded-xl border flex items-center justify-center transition-all ${
                        plato.disponible ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'
                      }`}
                      title={plato.disponible ? 'Marcar como Agotado' : 'Marcar como Disponible'}
                    >
                      {plato.disponible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>

                    <button 
                      type="button"
                      onClick={() => eliminarPlato(plato.id, plato.nombre)}
                      className="p-2 rounded-xl border bg-red-50 border-red-200 text-red-600 hover:bg-red-100 transition-all flex items-center justify-center"
                      title="Eliminar Plato Permanentemente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={guardarMenuDiario} className="w-full mt-6 bg-gray-950 text-white font-bold text-xs uppercase py-3.5 rounded-xl shadow-sm hover:bg-gray-900 transition">Establecer menú diario</button>
      </div>

      {/* MODAL HISTORIAL DE COMANDAS */}
      {verDetalleModal && (
        <div className="fixed inset-0 bg-gray-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl relative border border-gray-100">
            <button onClick={() => setVerDetalleModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            <h3 className="text-xl font-bold mb-4 border-b pb-3 flex items-center gap-2 text-gray-950"><ClipboardList className="text-emerald-700" /> Registro de Pedidos - {fechaSeleccionada}</h3>
            <div className="divide-y max-h-[400px] overflow-y-auto pr-1">
              {pedidosDia.length === 0 ? (
                <p className="text-center text-gray-400 text-xs py-8 italic">No se registran transacciones en esta fecha.</p>
              ) : (
                pedidosDia.map((p) => {
                  const { numeroMesa, nombreMesera, listaExtras } = procesarMesaCompleta(p.mesa);
                  return (
                    <div key={p.id} className="py-4 flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-black text-sm uppercase text-gray-950">Mesa {numeroMesa}</p>
                          <span className="text-[9px] px-2 py-0.5 rounded-md font-bold bg-emerald-700 text-white flex items-center gap-1"><User className="h-2.5 w-2.5" /> {nombreMesera}</span>
                        </div>
                        <div className="space-y-1 mt-2 pl-1">
                          {p.detalles_pedido?.map((det, idx) => (<p key={idx} className="text-xs text-gray-800 font-medium capitalize">• {det.platos?.nombre} <span className="text-gray-400 font-bold text-[10px]">x{det.cantidad}</span></p>))}
                        </div>
                        {listaExtras.length > 0 && (
                          <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 max-w-md">
                            <div className="flex flex-col gap-1">
                              {listaExtras.map((item, index) => (<p key={index} className="text-xs text-emerald-950 font-medium capitalize border-l-2 border-emerald-600/20 pl-2">{item}</p>))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="font-black text-base text-gray-950">${Number(p.total).toFixed(2)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}