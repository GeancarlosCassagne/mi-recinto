'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Utensils, ShoppingCart, Plus, Minus, CheckCircle, PlusCircle, Trash2, ChevronRight, Lock, User, AlertTriangle, Sparkles, Bike, UtensilsCrossed } from 'lucide-react';

interface Plato {
  id: string;
  nombre: string;
  precio: number;
  disponible: boolean;
  categoria: string;
}

interface CarritoItem {
  idUnico: string;
  plato: Plato;
  grid: number;
  detallesPersonalizados?: string;
  paraLlevar?: boolean;
}

interface Adicional {
  id: string;
  descripcion: string;
  precio: number;
}

export default function ClientMenu() {
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [mesa, setMesa] = useState<string>(''); // Este estado guardará el número de mesa O el nombre del cliente
  const [mesera, setMesera] = useState<string>('');
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [tipoEntrega, setTipoEntrega] = useState<'servirse' | 'llevar'>('servirse');
  
  const [cajaCerradaHoy, setCajaCerradaHoy] = useState(false);
  const [adicionales, setAdicionales] = useState<Adicional[]>([]);
  const [mostrarFormAdicional, setMostrarFormAdicional] = useState(false);
  const [descAdicional, setDescAdicional] = useState('');
  const [precioAdicional, setPrecioAdicional] = useState('');

  const [notificacion, setNotificacion] = useState<{ visible: boolean; mensaje: string }>({ visible: false, mensaje: '' });

  const [configurandoTonga, setConfigurandoTonga] = useState(false);
  const [pasoTonga, setPasoTonga] = useState<'gallina' | 'presa'>('gallina');
  const [tongaSeleccionada, setTongaSeleccionada] = useState<Plato | null>(null);
  const [tipoGallina, setTipoGallina] = useState<string>('');

  const [configurandoAlmuerzo, setConfigurandoAlmuerzo] = useState(false);
  const [almuerzoSeleccionado, setAlmuerzoSeleccionado] = useState<Plato | null>(null);
  const [pasoAlmuerzo, setPasoAlmuerzo] = useState<'tipo' | 'segundo' | 'caldo'>('tipo');
  const [tipoAlmuerzo, setTipoAlmuerzo] = useState<'completo' | 'segundo' | 'caldo'>('completo');
  const [almuerzoPrecio, setAlmuerzoPrecio] = useState<number>(3.00);
  const [segundoElegido, setSegundoElegido] = useState<string>('');

  const [mostrarConfirmarModal, setMostrarConfirmarModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(false);

  const listadoMeseras = ['Claudia', 'Carolina', 'Sofia', 'Maria', 'Esperanza'];

  // NUEVOS ESTADOS PARA PASAR A MODO EDICIÓN
  const [idPedidoAEditar, setIdPedidoAEditar] = useState<string | null>(null);
  const [pedidosActivos, setPedidosActivos] = useState<any[]>([]);
  const [mostrarListaModificar, setMostrarListaModificar] = useState(false);

  const mostrarCheckCentral = (texto: string) => {
    setNotificacion({ visible: true, mensaje: texto });
  };

  useEffect(() => {
    if (notificacion.visible) {
      const timer = setTimeout(() => {
        setNotificacion({ visible: false, mensaje: '' });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [notificacion.visible]);

  useEffect(() => {
    async function inicializarMenu() {
      const hoy = new Date().toISOString().split('T')[0];
      
      const { data: caja } = await supabase
        .from('cajas')
        .select('estado')
        .eq('fecha', hoy)
        .maybeSingle();
        
      if (caja?.estado === 'cerrada') {
        setCajaCerradaHoy(true);
      }

      const { data: todosLosPlatos } = await supabase
        .from('platos')
        .select('id, nombre, precio, disponible, categoria');

      const { data: datosMenuDiario, error } = await supabase
        .from('menu_diario')
        .select(`
          plato_id,
          platos (id, nombre, precio, disponible, categoria)
        `)
        .eq('fecha', hoy);
      
      if (!error && todosLosPlatos) {
        const idsAsignados = datosMenuDiario ? datosMenuDiario.map((item: any) => item.plato_id) : [];
        
        const platosFiltrados = todosLosPlatos.filter(plato => {
          const nombreLimpio = plato.nombre.toLowerCase();
          const esFijo = plato.categoria === 'fijo' ||
                         plato.categoria === 'tonga_gallina' ||
                         plato.categoria === 'tonga_presa' ||
                         nombreLimpio.includes('tonga') || 
                         nombreLimpio.includes('almuerzo del día') || 
                         nombreLimpio.includes('cola pequeña') || 
                         nombreLimpio.includes('cola grande') || 
                         nombreLimpio.includes('botella de agua');
          
          return esFijo || idsAsignados.includes(plato.id);
        });

        const platosMapeados = platosFiltrados.map(p => {
          const deMenuDiario = datosMenuDiario?.find((d: any) => d.plato_id === p.id) as any;
          return {
            ...p,
            categoria: p.categoria || deMenuDiario?.platos?.categoria || 'segundo'
          };
        });

        setPlatos(platosMapeados as Plato[]);
      }
    }
    inicializarMenu();

    const canal = supabase
      .channel('cambios-menu-cliente')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platos' }, () => inicializarMenu())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_diario' }, () => inicializarMenu())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cajas' }, () => inicializarMenu())
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  const cargarPedidoEnCarrito = (pedido: any) => {
    let textoMesa = pedido.mesa;
    if (textoMesa.includes('[TIPO:LLEVAR]')) {
      setTipoEntrega('llevar');
      textoMesa = textoMesa.replace('[TIPO:LLEVAR]', '').trim();
    } else {
      setTipoEntrega('servirse');
      if (textoMesa.includes('[TIPO:SERVIR]')) textoMesa = textoMesa.replace('[TIPO:SERVIR]', '').trim();
    }
    
    // Extraemos las especificaciones del string general guardado para reinyectarlas a la interfaz
    let especificacionExtra = '';
    if (textoMesa.includes('Especificaciones:')) {
      especificacionExtra = textoMesa.split('Especificaciones:')[1].replace(']', '').trim();
    }
    
    textoMesa = textoMesa.split('[MESERA:')[0].trim();
    setMesa(textoMesa);

    // Separamos las especificaciones por comas si hay múltiples almuerzos o combinaciones en la misma orden
    const combinacionesGuardadas = especificacionExtra.split(',').map(s => s.trim());

    const itemsCargados = pedido.detalles_pedido.map((det: any, index: number) => {
      // Buscamos si este plato tiene una combinación específica guardada en la cabecera
      const coincidencia = combinacionesGuardadas.find(c => c.includes(det.platos.nombre));
      let detalles = undefined;
      
      if (coincidencia) {
        // Extraemos lo que está dentro de los paréntesis: "Almuerzo Del Día (Completo: ...)" -> "Completo: ..."
        const match = coincidencia.match(/\(([^)]+)\)/);
        if (match && match[1]) {
          detalles = match[1];
        }
      }

      // Generamos un idUnico consistente para que el contador de cantidad y variantes funcione sin cruzarse
      const idUnico = detalles 
        ? `${det.plato_id}-${detalles.replace(/\s+/g, '-')}` 
        : `${det.plato_id}-${index}`;

      return {
        idUnico,
        plato: {
          id: det.plato_id,
          nombre: det.platos.nombre,
          precio: det.precio_unitario,
          disponible: true,
          categoria: 'fijo'
        },
        grid: det.cantidad,
        detallesPersonalizados: detalles
      };
    });

    setCarrito(itemsCargados);
    setIdPedidoAEditar(pedido.id);
    setMostrarListaModificar(false);
    mostrarCheckCentral('Pedido Cargado');
  };

  const handleAgregarClick = (plato: Plato) => {
    if (!plato) return;

    const nombreLimpio = plato.nombre.toLowerCase();
    if (nombreLimpio.includes('tonga')) {
      setTongaSeleccionada(plato);
      setConfigurandoTonga(true);
      setPasoTonga('gallina');
      setTipoGallina('');
    } else if (nombreLimpio.includes('almuerzo del día')) {
      setAlmuerzoSeleccionado(plato);
      setConfigurandoAlmuerzo(true);
      setPasoAlmuerzo('tipo');
      setSegundoElegido('');
    } else {
      agregarAlCarritoNormal(plato);
    }
  };

  const agregarAlCarritoNormal = (plato: Plato) => {
    mostrarCheckCentral('Seleccionado');

    setCarrito((prev) => {
      const existe = prev.find((item) => item.plato.id === plato.id && !item.detallesPersonalizados);
      if (existe) {
        return prev.map((item) =>
          item.plato.id === plato.id && !item.detallesPersonalizados ? { ...item, grid: item.grid + 1 } : item
        );
      }
      return [...prev, { idUnico: plato.id, plato, grid: 1 }];
    });
  };

  const finalizarTonga = (presa: string) => {
    if (!tongaSeleccionada) return;

    mostrarCheckCentral('Seleccionado');

    const detalles = `${tipoGallina} (${presa})`;
    const idUnico = `${tongaSeleccionada.id}-${detalles.replace(/\s+/g, '-')}`;

    setCarrito((prev) => {
      const existe = prev.find((item) => item.idUnico === idUnico);
      if (existe) {
        return prev.map((item) =>
          item.idUnico === idUnico ? { ...item, grid: item.grid + 1 } : item
        );
      }
      return [...prev, { idUnico, plato: tongaSeleccionada, grid: 1, detallesPersonalizados: detalles }];
    });

    setConfigurandoTonga(false);
    setTongaSeleccionada(null);
  };

  const seleccionarTipoAlmuerzo = (tipo: 'completo' | 'segundo' | 'caldo') => {
    let basePrecio = 3.00;
    if (tipo === 'segundo') basePrecio = 2.50;
    if (tipo === 'caldo') basePrecio = 1.50;

    const precioFinal = tipoEntrega === 'llevar' ? basePrecio + 0.25 : basePrecio;

    setTipoAlmuerzo(tipo);
    setAlmuerzoPrecio(precioFinal);

    if (tipo === 'caldo') {
      setPasoAlmuerzo('caldo');
    } else {
      setPasoAlmuerzo('segundo');
    }
  };

  const finalizarAlmuerzo = (sopaOBebida: string) => {
    if (!almuerzoSeleccionado) return;

    mostrarCheckCentral('Añadido');

    let detalles = '';
    const tagLlevar = tipoEntrega === 'llevar' ? ' [TARRINA]' : '';
    if (tipoAlmuerzo === 'completo') detalles = `Completo: ${segundoElegido} + ${sopaOBebida}${tagLlevar}`;
    if (tipoAlmuerzo === 'segundo') detalles = `Solo Segundo: ${segundoElegido}${tagLlevar}`;
    if (tipoAlmuerzo === 'caldo') detalles = `Solo Caldo: ${sopaOBebida}${tagLlevar}`;

    const idUnico = `${almuerzoSeleccionado.id}-${detalles.replace(/\s+/g, '-')}`;
    const platoModificado = { ...almuerzoSeleccionado, precio: almuerzoPrecio };

    setCarrito((prev) => {
      const existe = prev.find((item) => item.idUnico === idUnico);
      if (existe) {
        return prev.map((item) => item.idUnico === idUnico ? { ...item, grid: item.grid + 1 } : item);
      }
      return [...prev, { idUnico, plato: platoModificado, grid: 1, detallesPersonalizados: detalles, paraLlevar: tipoEntrega === 'llevar' }];
    });

    setConfigurandoAlmuerzo(false);
    setAlmuerzoSeleccionado(null);
  };

  const modificarCantidad = (idUnico: string, accion: 'incrementar' | 'decrementar') => {
    setCarrito((prev) =>
      prev
        .map((item) => {
          if (item.idUnico === idUnico) {
            const nuevoGrid = accion === 'incrementar' ? item.grid + 1 : item.grid - 1;
            return { ...item, grid: nuevoGrid };
          }
          return item;
        })
        .filter((item) => item.grid > 0)
    );
  };

  const agregarAdicionalALaLista = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descAdicional.trim() || !precioAdicional.trim()) return;
    const precioNum = parseFloat(precioAdicional);
    if (isNaN(precioNum) || precioNum < 0) return alert('Ingresa un precio válido.');

    setAdicionales([...adicionales, { id: crypto.randomUUID(), descripcion: descAdicional.trim(), precio: precioNum }]);
    setDescAdicional('');
    setPrecioAdicional('');
    setMostrarFormAdicional(false);
  };

  const totalPlatos = carrito.reduce((acc, item) => acc + (Number(item.plato.precio) * item.grid), 0);
  const totalAdicionales = adicionales.reduce((acc, adi) => acc + adi.precio, 0);
  const total = totalPlatos + totalAdicionales;

  const revisarPedidoAntesDeConfirmar = () => {
    if (!mesera) return alert('Por favor, selecciona tu nombre de mesera en el banner superior.');
    
    // MODIFICADO: Alerta contextualizada según el modo seleccionado
    if (!mesa.trim()) {
      return alert(tipoEntrega === 'llevar' ? 'Por favor, ingresa el nombre del cliente para llevar.' : 'Por favor, ingresa tu número de mesa.');
    }
    if (carrito.length === 0 && adicionales.length === 0) return alert('El pedido está vacío.');

    setMostrarConfirmarModal(true);
  };

  const enviarPedidoDefinitivoASupabase = async () => {
    setMostrarConfirmarModal(false);
    setEnviando(true);
    
    const prefijoTipo = tipoEntrega === 'llevar' ? '[TIPO:LLEVAR] ' : '[TIPO:SERVIR] ';
    let mesaConAdicionales = `${prefijoTipo}${mesa.trim()} [MESERA: ${mesera}]`;
    
    if (adicionales.length > 0) {
      const textoAdicionales = adicionales.map(a => `${a.descripcion} ($${a.precio.toFixed(2)})`).join(', ');
      mesaConAdicionales = `${mesaConAdicionales} [EXTRA: ${textoAdicionales}]`;
    }

    try {
      const detallesExtrasTexto = carrito
        .filter(item => item.detallesPersonalizados)
        .map(item => `${item.grid}x ${item.plato.nombre} (${item.detallesPersonalizados})`)
        .join(', ');

      if (detallesExtrasTexto) {
        const separador = mesaConAdicionales.includes('[EXTRA:') ? ' | ' : ' [EXTRA: ';
        const cierre = mesaConAdicionales.includes('[EXTRA:') ? '' : ']';
        mesaConAdicionales = `${mesaConAdicionales}${separador}Especificaciones: ${detallesExtrasTexto}${cierre}`;
      }

      if (idPedidoAEditar) {
        // MODO EDICIÓN: UPDATE Y REEMPLAZO DE PLATOS
        await supabase
          .from('pedidos')
          .update({ mesa: mesaConAdicionales, total })
          .eq('id', idPedidoAEditar);

        await supabase.from('detalles_pedido').delete().eq('pedido_id', idPedidoAEditar);

        const detallesParaInsertar = carrito.map((item) => ({
          pedido_id: idPedidoAEditar,
          plato_id: item.plato.id,
          cantidad: item.grid,
          precio_unitario: item.plato.precio
        }));

        if (detallesParaInsertar.length > 0) {
          await supabase.from('detalles_pedido').insert(detallesParaInsertar);
        }
        setIdPedidoAEditar(null);
      } else {
        // MODO NUEVO: INSERCIÓN LIMPIA ORIGINAL
        const { data: nuevoPedido, error: errorPedido } = await supabase
          .from('pedidos')
          .insert([{ mesa: mesaConAdicionales, total, estado: 'pendiente' }])
          .select()
          .single();

        if (errorPedido) throw errorPedido;

        if (detallesExtrasTexto) {
          await supabase.from('pedidos').update({ mesa: mesaConAdicionales }).eq('id', nuevoPedido.id);
        }

        const detallesParaInsertar = carrito.map((item) => ({
          pedido_id: nuevoPedido.id,
          plato_id: item.plato.id,
          cantidad: item.grid,
          precio_unitario: item.plato.precio
        }));

        if (detallesParaInsertar.length > 0) {
          await supabase.from('detalles_pedido').insert(detallesParaInsertar);
        }
      }

      setCarrito([]);
      setAdicionales([]);
      setMesa('');
      setMensajeExito(true);
      setTimeout(() => setMensajeExito(false), 4000);
    } catch (error: any) {
      console.error(error);
      alert('Hubo un problema al procesar tu pedido.');
    } finally {
      setEnviando(false);
    }
  };

  const opcionesSegundos = platos.filter(p => p.categoria === 'segundo');
  const opcionesCaldos = platos.filter(p => p.categoria === 'caldo');

  const opcionesGallinaTonga = platos.filter(p => p.categoria === 'tonga_gallina');
  const opcionesPresaTonga = platos.filter(p => p.categoria === 'tonga_presa');

  const platoAlmuerzoDelDia = platos.find(p => p.nombre.toLowerCase().includes('almuerzo del día'));
  
  const restoDePlatosCatalogo = platos
    .filter(p => {
      const n = p.nombre.toLowerCase();
      return p.categoria !== 'segundo' && p.categoria !== 'caldo' && p.categoria !== 'tonga_gallina' && p.categoria !== 'tonga_presa' && !n.includes('almuerzo del día');
    })
    .sort((a, b) => {
      const nameA = a.nombre.toLowerCase();
      const nameB = b.nombre.toLowerCase();
      if (nameA.includes('tonga')) return -1;
      if (nameB.includes('tonga')) return 1;
      return 0;
    });

  if (cajaCerradaHoy) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm max-w-md">
          <Lock className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Servicio Temporalmente Cerrado</h2>
          <p className="text-slate-500 text-sm">El restaurante ha cerrado su jornada comercial por hoy.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-8 relative text-gray-900 bg-white">
      
      {/* BANNER SELECCIÓN DE MESERA */}
      <div className="md:col-span-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-2.5">
          <User className="h-5 w-5 text-emerald-800" />
          <div>
            <h3 className="text-sm font-bold text-emerald-950">Registro del Personal de Servicio</h3>
            <p className="text-xs text-emerald-700 font-medium">Selecciona tu nombre antes de ingresar comandas</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
  {listadoMeseras.map((m) => (
    <button 
      key={m} 
      onClick={() => { 
        setMesera(m); 
        mostrarCheckCentral('Seleccionado');
      }} 
      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${mesera === m ? 'bg-emerald-700 text-white shadow-md scale-105' : 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-100/40'}`}
    >
      {m}
    </button>
  ))}
  
  {/* NUEVO BOTÓN AGREGADO AL DISEÑO */}
  <button 
    onClick={async () => {
      const hoy = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('pedidos')
        .select('id, mesa, total, detalles_pedido(cantidad, plato_id, precio_unitario, platos(nombre))')
        .eq('estado', 'pendiente')
        .gte('created_at', `${hoy} 00:00:00`);
      if (data) setPedidosActivos(data);
      setMostrarListaModificar(true);
    }}
    className="bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-extrabold shadow-sm hover:bg-amber-700 transition flex items-center gap-1"
  >
    ✏️ Editar Orden
  </button>
</div>
</div>

      {/* SECCIÓN DEL MENÚ */}
      <div className="md:col-span-2 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
          <div className="flex items-center space-x-3">
            <Utensils className="h-7 w-7 text-emerald-700" />
            <h1 className="text-2xl font-black text-gray-950 tracking-tight">Mi Recinto <span className="text-emerald-700 font-light">| Comida Manaba</span></h1>
          </div>
          
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 w-full sm:w-auto shadow-sm">
            <button 
              type="button" 
              onClick={() => {
                setTipoEntrega('servirse');
                setMesa(''); // Limpia el campo al cambiar de pestaña
              }} 
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${tipoEntrega === 'servirse' ? 'bg-white text-emerald-950 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <UtensilsCrossed className="h-3.5 w-3.5" />
              <span>Para Servirse</span>
            </button>
            <button 
              type="button" 
              onClick={() => {
                setTipoEntrega('llevar');
                setMesa(''); // Limpia el campo al cambiar de pestaña
              }} 
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${tipoEntrega === 'llevar' ? 'bg-emerald-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <Bike className="h-3.5 w-3.5" />
              <span>Para Llevar (+0.25)</span>
            </button>
          </div>
        </header>

        {mensajeExito && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center space-x-2 text-sm font-medium">
            <CheckCircle className="h-5 w-5 text-emerald-600" />
            <span>¡Tu pedido ha sido enviado con éxito a la comodidad de la cocina!</span>
          </div>
        )}

        {/* MODAL CONFIGURADOR ALMUERZO DIARIO */}
        {configurandoAlmuerzo && (
          <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-6 shadow-sm space-y-4 transition-all duration-200">
            <div className="flex justify-between items-center border-b border-emerald-100 pb-3">
              <h3 className="text-base font-bold text-emerald-950">Configurando Almuerzo Diario {tipoEntrega === 'llevar' && <span className="text-red-600 text-xs font-black">(Para Llevar)</span>}</h3>
              <button onClick={() => setConfigurandoAlmuerzo(false)} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Cancelar</button>
            </div>

            {pasoAlmuerzo === 'tipo' && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-3">1. Selecciona el tipo de servicio:</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button onClick={() => seleccionarTipoAlmuerzo('completo')} className="p-4 bg-white border rounded-xl hover:border-emerald-600 font-bold text-sm text-center flex flex-col items-center justify-center gap-1 shadow-sm"><span className="text-gray-950">Almuerzo Completo</span><span className="text-emerald-700 font-black text-xs">${tipoEntrega === 'llevar' ? '3.25' : '3.00'}</span></button>
                  <button onClick={() => seleccionarTipoAlmuerzo('segundo')} className="p-4 bg-white border rounded-xl hover:border-emerald-600 font-bold text-sm text-center flex flex-col items-center justify-center gap-1 shadow-sm"><span className="text-gray-950">Solo Segundo</span><span className="text-emerald-700 font-black text-xs">${tipoEntrega === 'llevar' ? '2.75' : '2.50'}</span></button>
                  <button onClick={() => seleccionarTipoAlmuerzo('caldo')} className="p-4 bg-white border rounded-xl hover:border-emerald-600 font-bold text-sm text-center flex flex-col items-center justify-center gap-1 shadow-sm"><span className="text-gray-950">Solo Caldo</span><span className="text-emerald-700 font-black text-xs">${tipoEntrega === 'llevar' ? '1.75' : '1.50'}</span></button>
                </div>
              </div>
            )}

            {pasoAlmuerzo === 'segundo' && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-3">2. Selecciona el plato Fuerte / Segundo:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {opcionesSegundos.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No hay platos fuertes registrados hoy.</p>
                  ) : (
                    opcionesSegundos.map((s) => (
                      <button 
                        key={s.id} 
                        disabled={!s.disponible}
                        onClick={() => { 
                          if (tipoAlmuerzo === 'completo') { 
                            setSegundoElegido(s.nombre);
                            setPasoAlmuerzo('caldo'); 
                          } else { 
                            setSegundoElegido(s.nombre);
                            if (!almuerzoSeleccionado) return;
                            const detalles = `Solo Segundo: ${s.nombre}${tipoEntrega === 'llevar' ? ' [TARRINA]' : ''}`;
                            const idUnico = `${almuerzoSeleccionado.id}-${detalles.replace(/\s+/g, '-')}`;
                            const platoModificado = { ...almuerzoSeleccionado, precio: almuerzoPrecio };

                            setCarrito((prev) => {
                              const existe = prev.find((item) => item.idUnico === idUnico);
                              if (existe) {
                                return prev.map((item) => item.idUnico === idUnico ? { ...item, grid: item.grid + 1 } : item);
                              }
                              return [...prev, { idUnico, plato: platoModificado, grid: 1, detallesPersonalizados: detalles, paraLlevar: tipoEntrega === 'llevar' }];
                            });

                            setConfigurandoAlmuerzo(false);
                            setAlmuerzoSeleccionado(null);
                            mostrarCheckCentral('Añadido');
                          } 
                        }} 
                        className={`p-3 border rounded-xl font-semibold text-left text-xs uppercase flex justify-between items-center shadow-sm transition-all ${
                          s.disponible 
                            ? 'bg-white text-gray-900 hover:bg-emerald-50/50' 
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{s.nombre}</span>
                          {!s.disponible && <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded uppercase">Agotado</span>}
                        </span>
                        {s.disponible && <ChevronRight className="h-4 w-4 text-emerald-700" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {pasoAlmuerzo === 'caldo' && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">3. Selecciona la Sopa / Caldo de hoy:</p>
                {tipoAlmuerzo === 'completo' && <p className="text-[11px] text-emerald-800 font-medium mb-3">Fuerte elegido: <span className="uppercase font-bold">{segundoElegido}</span></p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {opcionesCaldos.length === 0 ? (
                    <button onClick={() => finalizarAlmuerzo('Sin sopa (Solo Bebida)')} className="p-3 bg-white border rounded-xl font-bold text-gray-900 hover:bg-emerald-700 hover:text-white transition text-center text-xs shadow-sm">No hay caldos hoy (Pasar directo)</button>
                  ) : (
                    opcionesCaldos.map((c) => (
                      <button 
                        key={c.id} 
                        disabled={!c.disponible}
                        onClick={() => finalizarAlmuerzo(c.nombre)} 
                        className={`p-3 border rounded-xl font-bold text-center text-xs uppercase shadow-sm transition-all ${
                          c.disponible 
                            ? 'bg-white text-gray-900 hover:bg-emerald-700 hover:text-white' 
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <span>{c.nombre}</span>
                          {!c.disponible && <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded uppercase">Agotado</span>}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODAL CONFIGURADOR TONGA */}
        {configurandoTonga && (
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-emerald-100 pb-3">
              <h3 className="text-base font-bold text-emerald-950 flex items-center gap-2"><span>Personalizando {tongaSeleccionada?.nombre}</span></h3>
              <button onClick={() => setConfigurandoTonga(false)} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Cancelar</button>
            </div>
            {pasoTonga === 'gallina' ? (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">1. Tipo de gallina</p>
                <div className="grid grid-cols-2 gap-3">
                  {opcionesGallinaTonga.map((g) => (
                    <button 
                      key={g.id} 
                      disabled={!g.disponible}
                      onClick={() => { setTipoGallina(g.nombre); setPasoTonga('presa'); }} 
                      className={`p-3.5 border rounded-xl font-medium flex items-center justify-between text-sm shadow-sm transition-all ${
                        g.disponible 
                          ? 'bg-white text-gray-900 hover:border-emerald-600 hover:bg-emerald-50/30' 
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{g.nombre}</span>
                        {!g.disponible && <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded uppercase">Agotado</span>}
                      </span>
                      {g.disponible && <ChevronRight className="h-4 w-4 text-emerald-700" />}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">2. Presa favorita</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {opcionesPresaTonga.map((p) => (
                    <button 
                      key={p.id} 
                      disabled={!p.disponible}
                      onClick={() => finalizarTonga(p.nombre)} 
                      className={`p-3 border rounded-xl font-bold text-center text-sm shadow-sm transition-all ${
                        p.disponible 
                          ? 'bg-white text-gray-900 hover:bg-emerald-700 hover:text-white' 
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                      }`}
                    >
                      <span className="flex flex-col items-center justify-center gap-1">
                        <span>{p.nombre}</span>
                        {!p.disponible && <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded uppercase block">Agotado</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECCIÓN DESTAQUE INDIVIDUAL PARA EL ALMUERZO DEL DÍA */}
        {platoAlmuerzoDelDia && (
          <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 text-white rounded-2xl p-6 shadow-md border border-emerald-900 flex flex-col sm:flex-row justify-between items-center gap-6 relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 text-white/5 transform rotate-12 transition-transform group-hover:scale-110 duration-300">
              <Utensils className="h-32 w-32" />
            </div>
            <div className="space-y-1.5 min-w-0 z-10">
              <span className="bg-emerald-700 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1 w-fit shadow-sm">
                <Sparkles className="h-3 w-3 fill-white" /> Sugerencia de la Casa
              </span>
              <h2 className="text-xl font-black tracking-tight capitalize">{platoAlmuerzoDelDia.nombre} {tipoEntrega === 'llevar' && <span className="text-emerald-300 text-sm block sm:inline sm:ml-2">(Para Llevar)</span>}</h2>
              <p className="text-xs text-emerald-200 font-medium">Configura sopa, segundo o el servicio completo al instante.</p>
            </div>
            <div className="flex items-center gap-4 shrink-0 z-10 w-full sm:w-auto justify-between sm:justify-end">
              <span className="text-2xl font-black text-emerald-300 tracking-tight">
                ${(tipoEntrega === 'llevar' ? Number(platoAlmuerzoDelDia.precio) + 0.25 : Number(platoAlmuerzoDelDia.precio)).toFixed(2)}
              </span>
              <button
                onClick={() => platoAlmuerzoDelDia.disponible && handleAgregarClick(platoAlmuerzoDelDia)}
                disabled={!platoAlmuerzoDelDia.disponible}
                className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-md flex items-center space-x-2 ${
                  platoAlmuerzoDelDia.disponible 
                    ? 'bg-white text-emerald-950 hover:bg-emerald-50 hover:scale-[1.02]' 
                    : 'bg-emerald-900/50 text-emerald-600 cursor-not-allowed border border-emerald-800'
                }`}
              >
                <Plus className="h-4 w-4 stroke-[3]" />
                <span>{platoAlmuerzoDelDia.disponible ? 'Armar Almuerzo' : 'Agotado hoy'}</span>
              </button>
            </div>
          </div>
        )}

        {/* RESTO DEL CATÁLOGO REORDENADO */}
        <div className="space-y-4">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Carta y Adicionales</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {restoDePlatosCatalogo.map((plato) => (
              <div key={plato.id} className={`border rounded-2xl p-5 flex flex-col justify-between transition ${plato.disponible ? 'bg-white border-gray-200 hover:shadow-sm' : 'bg-gray-50 border-gray-200 opacity-50'}`}>
                <div>
                  <h3 className="text-lg font-bold capitalize text-gray-950">{plato.nombre}</h3>
                  {!plato.disponible && <span className="inline-block bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-md mt-1.5 uppercase">Agotado</span>}
                </div>
                <div className="flex justify-between items-center mt-5">
                  <span className="text-base font-black text-emerald-800">${Number(plato.precio).toFixed(2)}</span>
                  <button
                    onClick={() => plato.disponible && handleAgregarClick(plato)}
                    disabled={!plato.disponible}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${plato.disponible ? 'bg-emerald-700 text-white hover:bg-emerald-800' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Agregar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* CARRITO LATERAL */}
      <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50 h-fit space-y-5">
        <div className="flex items-center space-x-2 border-b border-gray-200 pb-3"><ShoppingCart className="h-5 w-5 text-emerald-800" /><h2 className="text-lg font-bold text-gray-950">Tu Pedido</h2></div>
        
        {/* MODIFICADO: Label e Input dinámicos en base al tipo de entrega */}
        <div>
          <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            {tipoEntrega === 'llevar' ? 'Nombre del Cliente / Identificador' : 'Mesa / Identificador'}
          </label>
          <input 
            type="text" 
            placeholder={tipoEntrega === 'llevar' ? 'Ej. Juan Pérez' : 'Ej. Mesa 4'} 
            value={mesa} 
            onChange={(e) => setMesa(e.target.value)} 
            className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-700 outline-none text-gray-950 bg-white shadow-sm" 
          />
        </div>

        <div className="divide-y divide-gray-200/60 max-h-60 overflow-y-auto pr-1">
          {carrito.length === 0 && adicionales.length === 0 && <p className="text-gray-400 text-center text-xs py-6 italic">No has agregado elementos.</p>}
          {carrito.map((item) => (
            <div key={item.idUnico} className="py-3 flex justify-between items-center">
              <div className="pr-2">
                <h4 className="font-bold text-gray-950 text-sm capitalize">{item.plato.nombre}</h4>
                {item.detallesPersonalizados && <p className="text-xs text-emerald-700 font-medium capitalize mt-0.5">{item.detallesPersonalizados}</p>}
                <p className="text-xs text-gray-500 mt-0.5">${(Number(item.plato.precio) * item.grid).toFixed(2)}</p>
              </div>
              <div className="flex items-center space-x-2 bg-white border rounded-xl p-1 shadow-sm">
                <button onClick={() => modificarCantidad(item.idUnico, 'decrementar')} className="p-1 hover:bg-gray-100 rounded-md text-gray-600 transition"><Minus className="h-3 w-3" /></button>
                <span className="font-bold text-gray-900 text-xs w-4 text-center">{item.grid}</span>
                <button onClick={() => modificarCantidad(item.idUnico, 'incrementar')} className="p-1 hover:bg-gray-100 rounded-md text-gray-600 transition"><Plus className="h-3 w-3" /></button>
              </div>
            </div>
          ))}

          {/* LISTA DE EXTRAS */}
          {adicionales.map((adi) => (
            <div key={adi.id} className="py-3 flex justify-between items-center bg-emerald-50/40 px-2 rounded-xl mt-1.5">
              <div>
                <h4 className="font-bold text-emerald-900 text-xs capitalize">[Extra] {adi.descripcion}</h4>
                <p className="text-xs text-emerald-700 mt-0.5">${adi.precio.toFixed(2)}</p>
              </div>
              <button onClick={() => setAdicionales(adicionales.filter((a) => a.id !== adi.id))} className="p-1 text-gray-400 hover:text-red-600 transition"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>

        {/* BOTÓN ADICIONALES */}
        {!mostrarFormAdicional ? (
          <button type="button" onClick={() => setMostrarFormAdicional(true)} className="w-full border border-dashed border-emerald-300 text-emerald-800 bg-white py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1 hover:bg-emerald-50/30 transition shadow-sm">
            <PlusCircle className="h-3.5 w-3.5 text-emerald-700" />
            <span>Agregar Nota o Adicional</span>
          </button>
        ) : (
          <form onSubmit={agregarAdicionalALaLista} className="bg-white p-3 border border-gray-200 rounded-xl space-y-2 shadow-sm">
            <input type="text" placeholder="Ej. Cola Extra o Porción de Maní" value={descAdicional} onChange={(e) => setDescAdicional(e.target.value)} className="w-full text-xs border rounded-lg p-2 text-gray-950 outline-none focus:border-emerald-600 bg-white" required />
            <input type="text" placeholder="Precio (Ej. 1.00)" value={precioAdicional} onChange={(e) => setPrecioAdicional(e.target.value)} className="w-full text-xs border rounded-lg p-2 text-gray-950 outline-none focus:border-emerald-600 bg-white" required />
            <div className="flex gap-2 justify-end text-[11px] font-bold pt-1">
              <button type="button" onClick={() => setMostrarFormAdicional(false)} className="text-gray-400 hover:text-gray-600">Cancelar</button>
              <button type="submit" className="px-3 py-1 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition">Añadir</button>
            </div>
          </form>
        )}

        <div className="border-t border-gray-200 pt-3 flex justify-between items-center text-base font-black text-gray-950"><span>Total:</span><span className="text-emerald-800">${total.toFixed(2)}</span></div>
        <button onClick={revisarPedidoAntesDeConfirmar} disabled={enviando || (carrito.length === 0 && adicionales.length === 0)} className="w-full bg-emerald-700 text-white py-3 rounded-xl font-bold hover:bg-emerald-800 shadow-sm text-sm tracking-wide">
    {enviando ? 'Procesando...' : idPedidoAEditar ? '💾 Guardar Cambios' : 'Confirmar Pedido'}
  </button>
      </div>

      {/* MODAL CENTRAL DE CONFIRMACIÓN */}
      {mostrarConfirmarModal && (
        <div className="fixed inset-0 bg-gray-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-all animate-in fade-in duration-200">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col space-y-4 text-left animate-in zoom-in-95 duration-200">
            
            <div className="flex items-center space-x-3 text-amber-600 border-b border-gray-100 pb-3">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <div>
                <h3 className="text-base font-black text-gray-950 tracking-tight">¿Confirmar comanda de servicio?</h3>
                <p className="text-xs text-gray-500 font-medium">Verifica el resumen antes de enviar a cocina</p>
              </div>
            </div>

            {/* MODIFICADO: Label de confirmación dinámico en el resumen */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-2 gap-2 text-xs font-bold">
              <p className="text-gray-500">
                {tipoEntrega === 'llevar' ? 'Cliente (Para Llevar):' : 'Mesa / Identificador:'} 
                <span className="text-gray-950 block text-sm uppercase font-black mt-0.5">{mesa}</span>
              </p>
              <p className="text-gray-500">Atendido por: <span className="text-emerald-800 block text-sm uppercase font-black mt-0.5">{mesera || 'No seleccionada'}</span></p>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 divide-y divide-gray-100/60 text-xs">
              {carrito.map((item) => (
                <div key={item.idUnico} className="pt-2 flex justify-between items-start">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-gray-950 capitalize">{item.plato.nombre}</p>
                    {item.detallesPersonalizados && <p className="text-[11px] text-emerald-700 font-semibold mt-0.5 capitalize">{item.detallesPersonalizados}</p>}
                  </div>
                  <span className="font-extrabold text-gray-900 bg-gray-100 px-2 py-0.5 rounded shrink-0">x{item.grid}</span>
                </div>
              ))}

              {adicionales.map((adi) => (
                <div key={adi.id} className="pt-2 flex justify-between items-center text-emerald-900 font-semibold bg-emerald-50/30 px-2 py-1 rounded-lg mt-1">
                  <p className="capitalize truncate">[Nota Extra] {adi.descripcion}</p>
                  <span className="font-extrabold shrink-0">${adi.precio.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3 flex justify-between items-center font-black text-lg text-gray-950">
              <span>Total a cobrar:</span>
              <span className="text-emerald-800">${total.toFixed(2)}</span>
            </div>

            <div className="flex items-center gap-3 pt-2 font-bold text-xs uppercase">
              <button onClick={() => setMostrarConfirmarModal(false)} className="w-1/2 border border-gray-200 text-gray-700 py-3 rounded-xl hover:bg-gray-50 transition">No, Revisar</button>
              <button onClick={enviarPedidoDefinitivoASupabase} className="w-1/2 bg-emerald-700 text-white py-3 rounded-xl hover:bg-emerald-800 shadow-sm transition">Sí, Confirmar</button>
            </div>

          </div>
        </div>
      )}

      {/* POPUP FLOTANTE CENTRAL PARA LOS CHECKS DE CONFIRMACIÓN */}
      {notificacion.visible && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-8 py-6 shadow-2xl flex flex-col items-center space-y-3 animate-in zoom-in-95 duration-150 text-white">
            <CheckCircle className="h-14 w-14 text-emerald-500 animate-bounce" />
            <span className="text-lg font-black tracking-wide uppercase">{notificacion.mensaje}</span>
          </div>
        </div>
      )}

      {/* MODAL DE SELECCIÓN DE COMANDA ACTIVA A EDITAR */}
      {mostrarListaModificar && (
        <div className="fixed inset-0 bg-gray-950/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6 shadow-2xl flex flex-col space-y-4 text-left">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-base font-black text-gray-950">Seleccionar Comanda para Modificar</h3>
              <button onClick={() => setMostrarListaModificar(false)} className="text-xs font-bold text-gray-400 hover:text-gray-600">X</button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 divide-y divide-gray-100">
              {pedidosActivos.length === 0 ? (
                <p className="text-center text-gray-400 text-xs py-4 italic">No hay comandas pendientes en cocina hoy.</p>
              ) : (
                pedidosActivos.map((ped) => {
                  const labelMesa = ped.mesa.includes('[TIPO:LLEVAR]') ? ped.mesa.split('[TIPO:LLEVAR]')[1].split('[MESERA:')[0].trim() : ped.mesa.split('[TIPO:SERVIR]')[1]?.split('[MESERA:')[0].trim() || ped.mesa;
                  return (
                    <button 
                      key={ped.id} 
                      onClick={() => cargarPedidoEnCarrito(ped)}
                      className="w-full text-left p-3 hover:bg-slate-50 transition rounded-xl flex justify-between items-center text-xs pt-2.5"
                    >
                      <div>
                        <span className="font-black text-gray-950 uppercase block">{ped.mesa.includes('[TIPO:LLEVAR]') ? `Cliente: ${labelMesa}` : `Mesa: ${labelMesa}`}</span>
                        <span className="text-gray-400 text-[10px]">Total original: ${Number(ped.total).toFixed(2)}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-emerald-700" />
                    </button>
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