'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { PlusCircle, DollarSign, Calendar, ClipboardList, Lock, X, Trash2, CheckSquare, Square, User, Eye, EyeOff } from 'lucide-react';

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

const obtenerFechaLocal = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

export default function AdminPage() {
  const [autenticado, setAutenticado] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [errorPass, setErrorPass] = useState(false);
  const CLAVE_ACCESO = '9999';

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

  const [platos, setPlatos] = useState<Plato[]>([]);
  const [platosSeleccionados, setPlatosSeleccionados] = useState<string[]>([]);
  const [pedidosDia, setPedidosDia] = useState<Pedido[]>([]);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [categoria, setCategoria] = useState('segundo');
  const [cargando, setCargando] = useState(false);
  
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(obtenerFechaLocal());
  const [estadoCaja, setEstadoCaja] = useState<'abierta' | 'cerrada'>('abierta');
  const [verDetalleModal, setVerDetalleModal] = useState(false);

  const [idPlatoEditando, setIdPlatoEditando] = useState<string | null>(null);
  const [nuevoNombrePlato, setNuevoNombrePlato] = useState('');
  const [nuevoPrecioPlato, setNuevoPrecioPlato] = useState('');

  const [listadoMeseras, setListadoMeseras] = useState<{ id: string; nombre: string }[]>([]);
  const [nuevaMesera, setNuevaMesera] = useState('');

  const obtenerMeseras = async () => {
    const { data } = await supabase.from('meseras').select('id, nombre').order('nombre', { ascending: true });
    if (data) setListadoMeseras(data);
  };

  const guardarMesera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaMesera.trim()) return;
    const { error } = await supabase.from('meseras').insert([{ nombre: nuevaMesera.trim() }]);
    if (!error) {
      setNuevaMesera('');
      obtenerMeseras();
    } else {
      alert('Esa mesera ya existe o hubo un error.');
    }
  };

  const eliminarMesera = async (id: string, nombre: string) => {
    if (!confirm(`¿Eliminar a la mesera "${nombre}"?`)) return;
    const { error } = await supabase.from('meseras').delete().eq('id', id);
    if (!error) obtenerMeseras();
  };

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
    obtenerMeseras();

    const canalAdmin = supabase
      .channel('cambios-admin-panel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => cargarDatosDelDia(fechaSeleccionada))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platos' }, () => obtenerPlatos())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cajas' }, () => cargarDatosDelDia(fechaSeleccionada))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_diario' }, () => obtenerMenuDelDia(fechaSeleccionada))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meseras' }, () => obtenerMeseras())
      .subscribe();

    return () => {
      supabase.removeChannel(canalAdmin);
    };
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

  const guardarCambiosPlato = async (id: string) => {
    if (!nuevoNombrePlato.trim()) return alert('El nombre no puede estar vacío.');
    const precioNum = parseFloat(nuevoPrecioPlato);
    if (isNaN(precioNum) || precioNum <= 0) return alert('Ingresa un precio válido.');

    const { error } = await supabase
      .from('platos')
      .update({ 
        nombre: nuevoNombrePlato.trim(),
        precio: precioNum 
      })
      .eq('id', id);

    if (!error) {
      setIdPlatoEditando(null);
      setNuevoNombrePlato('');
      setNuevoPrecioPlato('');
      obtenerPlatos();
    } else {
      alert('Error al actualizar el plato.');
    }
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

  const esPlatoFijoInmutable = (nombrePlato: string, catPlato: string) => {
    const n = nombrePlato.toLowerCase();
    return catPlato === 'fijo' || 
           catPlato === 'bebida' ||
           catPlato === 'jugo' ||
           catPlato === 'presa_criolla' ||
           catPlato === 'presa_granja' ||
           catPlato === 'presa_caldo' ||
           n.includes('tonga') || 
           n.includes('caldo criollo') ||
           n.includes('seco criollo') ||
           n.includes('almuerzo del día') || 
           n.includes('cola pequeña') || 
           n.includes('cola grande') || 
           n.includes('botella de agua');
  };

  const eliminarPlato = async (id: string, nombrePlato: string, catPlato: string) => {
    const esFijo = esPlatoFijoInmutable(nombrePlato, catPlato);

    const mensajeConfirmacion = esFijo
      ? `⚠️ ¡ATENCIÓN! Estás intentando borrar un plato FIJO ("${nombrePlato}").\n\n¿Estás completamente seguro de eliminarlo del Banco General?`
      : `¿Estás seguro de que deseas eliminar permanentemente el plato "${nombrePlato}" del Banco General?`;

    const seguro = confirm(mensajeConfirmacion);
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
    let numeroMesa = textoMesa; 
    let nombreMesera = 'No especificada'; 
    let listaExtras: string[] = [];

    if (textoMesa.includes('[MESERA:')) {
      numeroMesa = textoMesa.split('[MESERA:')[0].trim();
      nombreMesera = textoMesa.split('[MESERA:')[1].split(']')[0].trim();
    }
    if (numeroMesa.includes('[EXTRA:')) numeroMesa = numeroMesa.split('[EXTRA:')[0].trim();
    if (numeroMesa.includes('[TIPO:LLEVAR]')) numeroMesa = numeroMesa.replace('[TIPO:LLEVAR]', '').trim();
    if (numeroMesa.includes('[TIPO:SERVIR]')) numeroMesa = numeroMesa.replace('[TIPO:SERVIR]', '').trim();

    if (textoMesa.includes('Especificaciones:')) {
      const textoEsp = textoMesa.split('Especificaciones:')[1].replace(']', '').trim();
      listaExtras = textoEsp.split(/,|\|/).map(seg => seg.trim()).filter(Boolean);
    } else if (textoMesa.includes('[EXTRA:')) {
      const textoExtra = textoMesa.split('[EXTRA:')[1].split(']')[0].trim();
      listaExtras = textoExtra.split(/,|\|/).map(seg => seg.trim()).filter(Boolean);
    }

    return { numeroMesa, nombreMesera, listaExtras };
  };

  const totalRecaudado = pedidosDia.filter(p => p.estado === 'entregado').reduce((acc, p) => acc + Number(p.total), 0);

  const platosPlanificadorVisibles = platos.filter(p => 
    p.categoria !== 'presa_criolla' && 
    p.categoria !== 'presa_granja' && 
    p.categoria !== 'presa_caldo'
  );

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-6 grid grid-cols-1 md:grid-cols-3 gap-8 w-full text-gray-900 max-w-7xl mx-auto">
      
      {!autenticado && (
        <div className="fixed inset-0 bg-slate-950/85 z-[200] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white border border-gray-100 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Lock className="h-8 w-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black text-gray-950 tracking-tight">Acceso Administrativo</h2>
              <p className="text-xs text-gray-500 font-medium">
                Estás intentando ingresar a la interfaz de <br/>
                <strong className="text-amber-800 font-black uppercase text-sm">"Panel de Administración"</strong>
              </p>
            </div>

            <form onSubmit={validarAcceso} className="space-y-4">
              <div>
                <input 
                  type="password" 
                  value={passInput} 
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="Ingresa clave de administrador..."
                  className={`w-full border rounded-2xl p-3.5 text-center font-bold text-sm outline-none transition-all ${
                    errorPass ? 'border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-400' : 'border-gray-200 bg-gray-50 focus:border-amber-700 focus:bg-white'
                  }`}
                  autoFocus
                />
                {errorPass && <p className="text-[11px] font-bold text-red-600 mt-2">Clave administrativa incorrecta.</p>}
              </div>

              <button 
                type="submit" 
                className="w-full bg-slate-900 text-white font-extrabold text-xs uppercase py-4 rounded-2xl shadow-md hover:bg-slate-800 transition tracking-wider"
              >
                Desbloquear Panel
              </button>
            </form>
          </div>
        </div>
      )}

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

      {/* COLUMNA IZQUIERDA: FORMULARIO + MÓDULOS DE DISPONIBILIDAD DE COCINA */}
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 h-fit shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold pb-4 border-b mb-5 flex items-center gap-2"><PlusCircle className="text-emerald-700 h-5 w-5" /> Registrar Plato Base</h2>
            <form onSubmit={guardarPlato} className="space-y-4">
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Nombre del Plato</label><input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full border rounded-xl p-2.5 text-sm bg-white outline-none focus:border-emerald-700" placeholder="Ej. Ceviche" /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">Precio Unitario (USD)</label><input type="text" value={precio} onChange={(e) => setPrecio(e.target.value)} className="w-full border rounded-xl p-2.5 text-sm bg-white outline-none focus:border-emerald-700" placeholder="Ej. 5.00" /></div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Tipo / Categoría de Plato</label>
                <select 
                  value={categoria} 
                  onChange={(e) => setCategoria(e.target.value)} 
                  className="w-full border border-gray-200 rounded-xl p-2.5 text-sm bg-white outline-none focus:border-emerald-700 font-medium text-gray-800"
                >
                  <option value="segundo">🥩 Segundo (Plato Fuerte)</option>
                  <option value="caldo">🥣 Caldo / Sopa</option>
                  <option value="fijo">🍃 Fijo (Tonga, Almuerzo del Día)</option>
                  <option value="jugo">🧃 Jugo del Día (Incluido en Almuerzo)</option>
                  <option value="bebida">🥤 Bebida Comercial (Cola / Agua - Extra)</option>
                </select>
              </div>

              <button type="submit" className="w-full bg-emerald-700 text-white font-bold text-sm py-3 rounded-xl shadow-sm hover:bg-emerald-800 transition">Guardar en Banco General</button>
            </form>
          </div>

          {/* 🟢 MÓDULOS SEPARADOS DE DISPONIBILIDAD DE PRESAS */}
          <div className="border-t pt-5 space-y-4">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">
              Control de Presas por Cocina
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {/* 1. PRESAS CRIOLLAS (TONGA CRIOLLA + SECO CRIOLLO) */}
              <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-3.5 space-y-2">
                <div className="flex justify-between items-center border-b border-amber-200/60 pb-1.5">
                  <h4 className="text-xs font-black text-amber-950 uppercase">🐓 Presas Criollas</h4>
                  <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">Tonga + Seco</span>
                </div>
                <div className="space-y-1.5">
                  {platos.filter(p => p.categoria === 'presa_criolla').map((comp) => (
                    <div key={comp.id} className="flex justify-between items-center text-xs p-2 bg-white rounded-xl border border-amber-100 shadow-sm">
                      <span className="font-bold text-gray-800 capitalize">{comp.nombre.replace(' Criolla', '')}</span>
                      <button 
                        type="button" 
                        onClick={() => alternarDisponibilidad(comp.id, comp.disponible)}
                        className={`p-1.5 rounded-lg border flex items-center justify-center transition-all ${
                          comp.disponible ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
                        }`}
                      >
                        {comp.disponible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. PRESAS DE GRANJA (TONGA GRANJA + POLLO HORNEADO) */}
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-3.5 space-y-2">
                <div className="flex justify-between items-center border-b border-emerald-200/60 pb-1.5">
                  <h4 className="text-xs font-black text-emerald-950 uppercase">🍗 Presas Granja</h4>
                  <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">Tonga + Horneado</span>
                </div>
                <div className="space-y-1.5">
                  {platos.filter(p => p.categoria === 'presa_granja').map((comp) => (
                    <div key={comp.id} className="flex justify-between items-center text-xs p-2 bg-white rounded-xl border border-emerald-100 shadow-sm">
                      <span className="font-bold text-gray-800 capitalize">{comp.nombre.replace(' Granja', '')}</span>
                      <button 
                        type="button" 
                        onClick={() => alternarDisponibilidad(comp.id, comp.disponible)}
                        className={`p-1.5 rounded-lg border flex items-center justify-center transition-all ${
                          comp.disponible ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
                        }`}
                      >
                        {comp.disponible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. PRESAS INDEPENDIENTES PARA CALDO */}
              <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-3.5 space-y-2">
                <div className="flex justify-between items-center border-b border-blue-200/60 pb-1.5">
                  <h4 className="text-xs font-black text-blue-950 uppercase">🥣 Presas para Caldo</h4>
                  <span className="text-[9px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">Exclusivo Caldos</span>
                </div>
                <div className="space-y-1.5">
                  {platos.filter(p => p.categoria === 'presa_caldo').map((comp) => (
                    <div key={comp.id} className="flex justify-between items-center text-xs p-2 bg-white rounded-xl border border-blue-100 shadow-sm">
                      <span className="font-bold text-gray-800 capitalize">{comp.nombre.replace(' Caldo', '')}</span>
                      <button 
                        type="button" 
                        onClick={() => alternarDisponibilidad(comp.id, comp.disponible)}
                        className={`p-1.5 rounded-lg border flex items-center justify-center transition-all ${
                          comp.disponible ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
                        }`}
                      >
                        {comp.disponible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        {/* MÓDULO GESTIÓN DE MESERAS */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
            <User className="h-5 w-5 text-emerald-700" /> Personal de Servicio (Meseras)
          </h2>

          <form onSubmit={guardarMesera} className="flex gap-2">
            <input 
              type="text" 
              value={nuevaMesera} 
              onChange={(e) => setNuevaMesera(e.target.value)} 
              placeholder="Nombre de mesera..." 
              className="w-full border rounded-xl p-2.5 text-xs bg-white outline-none focus:border-emerald-700 font-bold text-gray-900"
            />
            <button type="submit" className="bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-emerald-800 transition shrink-0">
              Agregar
            </button>
          </form>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 pt-2">
            {listadoMeseras.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-2">No hay meseras registradas.</p>
            ) : (
              listadoMeseras.map((m) => (
                <div key={m.id} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-xs font-bold text-gray-800 uppercase">
                  <span>👤 {m.nombre}</span>
                  <button 
                    type="button" 
                    onClick={() => eliminarMesera(m.id, m.nombre)} 
                    className="p-1 text-red-500 hover:text-red-700 transition"
                    title="Eliminar mesera"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* PLANIFICADOR MENÚ DIARIO REDISEÑADO */}
      <div className="md:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 flex flex-col h-fit shadow-sm">
        <div className="flex justify-between border-b border-gray-100 pb-4 mb-4 items-center">
          <h2 className="text-lg font-bold text-gray-950">Planificador del Menú del Día</h2>
          <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold px-2.5 py-1 rounded-md uppercase">Índice Activo</span>
        </div>

        <div className="space-y-3 overflow-y-auto pr-1.5 pb-2 max-h-[520px]">
          {platosPlanificadorVisibles.map((plato) => {
            const esFijo = esPlatoFijoInmutable(plato.nombre, plato.categoria);
            const marcado = esFijo || platosSeleccionados.includes(plato.id);

            return (
              <div 
                key={plato.id} 
                className={`p-3.5 border rounded-2xl flex justify-between items-center transition-all gap-4 shadow-sm ${
                  marcado ? 'bg-emerald-50/40 border-emerald-200' : 'bg-gray-50/60 border-gray-200 hover:border-gray-300 hover:bg-white'
                }`}
              >
                <div className="flex items-center space-x-3.5 flex-1 min-w-0">
                  <button 
                    type="button"
                    onClick={() => alternarSeleccionPlato(plato.id, plato.nombre, plato.categoria)} 
                    className="flex items-center justify-center text-gray-400 hover:text-emerald-700 transition-colors focus:outline-none shrink-0"
                  >
                    {marcado ? (
                      <CheckSquare className={`h-5 w-5 ${esFijo ? 'text-gray-400' : 'text-emerald-700'}`} />
                    ) : (
                      <Square className="h-5 w-5 text-gray-300" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    {idPlatoEditando === plato.id ? (
                      <div className="flex items-center gap-1.5 my-0.5">
                        <input 
                          type="text" 
                          value={nuevoNombrePlato} 
                          onChange={(e) => setNuevoNombrePlato(e.target.value)} 
                          placeholder="Nombre..."
                          className="text-xs font-bold border border-emerald-600 rounded-lg px-2 py-1 bg-white outline-none text-gray-900 w-full shadow-inner"
                          autoFocus
                        />
                        <div className="relative shrink-0 w-20">
                          <span className="absolute left-2 top-1 text-xs text-gray-400 font-bold">$</span>
                          <input 
                            type="text" 
                            value={nuevoPrecioPlato} 
                            onChange={(e) => setNuevoPrecioPlato(e.target.value)} 
                            placeholder="0.00"
                            className="text-xs font-bold border border-emerald-600 rounded-lg pl-5 pr-1 py-1 bg-white outline-none text-gray-900 w-full shadow-inner"
                          />
                        </div>
                        <button 
                          type="button" 
                          onClick={() => guardarCambiosPlato(plato.id)} 
                          className="bg-emerald-700 text-white font-bold text-[10px] uppercase px-2.5 py-1 rounded-lg hover:bg-emerald-800 shrink-0"
                        >
                          💾
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setIdPlatoEditando(null)} 
                          className="text-gray-400 hover:text-gray-600 text-xs font-bold shrink-0 px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm capitalize text-gray-950 truncate">{plato.nombre}</h4>
                        <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                          ${Number(plato.precio).toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="mt-1 flex items-center space-x-1">
                      <select 
                        value={plato.categoria || 'segundo'} 
                        onChange={(e) => cambiarCategoriaPlato(plato.id, e.target.value)}
                        className="text-[11px] font-bold text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-0.5 outline-none focus:border-emerald-600 transition shadow-sm"
                      >
                        <option value="segundo">🥩 Segundo</option>
                        <option value="caldo">🥣 Caldo</option>
                        <option value="fijo">🍃 Fijo</option>
                        <option value="jugo">🧃 Jugo del Día</option>
                        <option value="bebida">🥤 Bebida Comercial</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button 
                    type="button"
                    onClick={() => {
                      setIdPlatoEditando(plato.id);
                      setNuevoNombrePlato(plato.nombre);
                      setNuevoPrecioPlato(Number(plato.precio).toFixed(2));
                    }}
                    className="p-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all"
                    title="Editar Nombre y Precio del Plato"
                  >
                    ✏️
                  </button>

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
                    onClick={() => eliminarPlato(plato.id, plato.nombre, plato.categoria)}
                    className={`p-2 rounded-xl border transition-all ${
                      esFijo 
                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' 
                        : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                    }`}
                    title={esFijo ? 'Eliminar Plato Fijo (Requiere Confirmación)' : 'Eliminar Plato Permanentemente'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={guardarMenuDiario} 
          className="w-full mt-4 bg-gray-950 text-white font-extrabold text-xs uppercase py-4 rounded-xl shadow-md hover:bg-gray-900 transition tracking-wider"
        >
          Establecer Menú Diario
        </button>
      </div>

      {/* MODAL HISTORIAL DE COMANDAS REDISEÑADO */}
      {verDetalleModal && (
        <div className="fixed inset-0 bg-gray-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl relative border border-gray-100">
            <button onClick={() => setVerDetalleModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            <h3 className="text-xl font-bold mb-4 border-b pb-3 flex items-center gap-2 text-gray-950"><ClipboardList className="text-emerald-700" /> Registro de Pedidos - {fechaSeleccionada}</h3>
            <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto pr-1">
              {pedidosDia.length === 0 ? (
                <p className="text-center text-gray-400 text-xs py-8 italic">No se registran transacciones en esta fecha.</p>
              ) : (
                pedidosDia.map((p) => {
                  const { numeroMesa, nombreMesera, listaExtras } = procesarMesaCompleta(p.mesa);
                  const esParaLlevar = p.mesa.includes('[TIPO:LLEVAR]');

                  return (
                    <div key={p.id} className="py-4 border-b border-gray-100 last:border-0 space-y-3">
                      <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-2.5">
                          <span className={`text-xs font-black uppercase px-2.5 py-1 rounded-lg ${
                            esParaLlevar ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                          }`}>
                            {esParaLlevar ? `🏃‍♂️ Cliente: ${numeroMesa}` : `🍽️ Mesa ${numeroMesa}`}
                          </span>
                          <span className="text-[11px] font-bold text-gray-600 bg-white border px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                            <User className="h-3 w-3 text-emerald-700" /> {nombreMesera}
                          </span>
                        </div>
                        <span className="font-black text-base text-emerald-900 font-mono">
                          ${Number(p.total).toFixed(2)}
                        </span>
                      </div>

                      <div className="space-y-1.5 pl-1">
                        {listaExtras.length > 0 ? (
                          listaExtras.map((extra, idx) => (
                            <div key={idx} className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl text-xs font-bold text-emerald-950 flex items-start gap-2">
                              <span className="text-emerald-700 font-black">•</span>
                              <span className="capitalize leading-snug">{extra}</span>
                            </div>
                          ))
                        ) : (
                          p.detalles_pedido?.map((det, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs font-bold text-gray-800 bg-gray-50/60 p-2 rounded-lg border border-gray-100">
                              <span className="capitalize">• {det.platos?.nombre}</span>
                              <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded-md font-mono text-[11px]">x{det.cantidad}</span>
                            </div>
                          ))
                        )}
                      </div>
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