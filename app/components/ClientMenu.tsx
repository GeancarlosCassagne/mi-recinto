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

const obtenerFechaLocal = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

export default function ClientMenu() {
  const [autenticado, setAutenticado] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [errorPass, setErrorPass] = useState(false);
  const CLAVE_ACCESO = '1234';

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
  const [mesa, setMesa] = useState<string>(''); 
  const [mesera, setMesera] = useState<string>('');
  const [listadoMeseras, setListadoMeseras] = useState<string[]>([]);
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [tipoEntrega, setTipoEntrega] = useState<'servirse' | 'llevar'>('servirse');
  
  const [cajaCerradaHoy, setCajaCerradaHoy] = useState(false);
  const [adicionales, setAdicionales] = useState<Adicional[]>([]);
  const [mostrarFormAdicional, setMostrarFormAdicional] = useState(false);
  const [descAdicional, setDescAdicional] = useState('');
  const [precioAdicional, setPrecioAdicional] = useState('');

  const [notificacion, setNotificacion] = useState<{ visible: boolean; mensaje: string }>({ visible: false, mensaje: '' });

  const [configurandoTonga, setConfigurandoTonga] = useState(false);
  const [pasoTonga, setPasoTonga] = useState<'tipo' | 'presa'>('tipo');
  const [tongaSeleccionada, setTongaSeleccionada] = useState<Plato | null>(null);
  const [tipoGallina, setTipoGallina] = useState<string>('');

  const [configurandoAlmuerzo, setConfigurandoAlmuerzo] = useState(false);
  const [almuerzoSeleccionado, setAlmuerzoSeleccionado] = useState<Plato | null>(null);
  const [pasoAlmuerzo, setPasoAlmuerzo] = useState<'tipo' | 'segundo' | 'caldo' | 'bebida'>('tipo');
  const [tipoAlmuerzo, setTipoAlmuerzo] = useState<'completo' | 'segundo' | 'caldo'>('completo');
  const [sopaElegida, setSopaElegida] = useState<string>('');
  const [almuerzoPrecio, setAlmuerzoPrecio] = useState<number>(3.00);
  const [segundoElegido, setSegundoElegido] = useState<string>('');

  const [mostrarConfirmarModal, setMostrarConfirmarModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(false);

  const [idPedidoAEditar, setIdPedidoAEditar] = useState<string | null>(null);
  const [pedidosActivos, setPedidosActivos] = useState<any[]>([]);
  const [mostrarListaModificar, setMostrarListaModificar] = useState(false);

  const mostrarCheckCentral = (texto: string) => {
    setNotificacion({ visible: true, mensaje: texto });
  };

  const obtenerMeserasCliente = async () => {
    const { data } = await supabase.from('meseras').select('nombre').order('nombre', { ascending: true });
    if (data) setListadoMeseras(data.map(m => m.nombre));
  };

  const inicializarMenu = async () => {
    const hoy = obtenerFechaLocal();
    
    const { data: caja } = await supabase
      .from('cajas')
      .select('estado')
      .eq('fecha', hoy)
      .maybeSingle();
      
    if (caja?.estado === 'cerrada') {
      setCajaCerradaHoy(true);
    } else {
      setCajaCerradaHoy(false);
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
        const esComponenteEstructural = plato.categoria === 'presa_criolla' ||
                                        plato.categoria === 'presa_granja' ||
                                        plato.categoria === 'presa_caldo' ||
                                        nombreLimpio.includes('almuerzo del día');
        
        return esComponenteEstructural || idsAsignados.includes(plato.id);
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
    inicializarMenu();
    obtenerMeserasCliente();

    const canal = supabase
      .channel('cambios-menu-cliente-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platos' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          setPlatos((prev) => prev.filter((p) => p.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
          setPlatos((prev) =>
            prev.map((p) => (p.id === payload.new.id ? { ...p, ...payload.new } : p))
          );
        }
        inicializarMenu();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_diario' }, () => inicializarMenu())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cajas' }, () => inicializarMenu())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meseras' }, () => obtenerMeserasCliente())
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
    
    let especificacionExtra = '';
    if (textoMesa.includes('Especificaciones:')) {
      especificacionExtra = textoMesa.split('Especificaciones:')[1].replace(']', '').trim();
    }
    
    textoMesa = textoMesa.split('[MESERA:')[0].trim();
    setMesa(textoMesa);

    const combinacionesGuardadas = especificacionExtra.split(',').map(s => s.trim());

    const itemsCargados = pedido.detalles_pedido.map((det: any, index: number) => {
      const coincidencia = combinacionesGuardadas.find(c => c.includes(det.platos.nombre));
      let detalles = undefined;
      
      if (coincidencia) {
        const match = coincidencia.match(/\(([^)]+)\)/);
        if (match && match[1]) {
          detalles = match[1];
        }
      }

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
    
    // 1. Tonga: Pregunta el tipo primero (Criolla o Granja)
    if (nombreLimpio.includes('tonga')) {
      setTongaSeleccionada(plato);
      setConfigurandoTonga(true);
      setPasoTonga('tipo');
      setTipoGallina('');
    } 
    // 2. Seco Criollo: Directo a presas Criollas
    else if (nombreLimpio.includes('seco criollo')) {
      setTongaSeleccionada(plato);
      setConfigurandoTonga(true);
      setPasoTonga('presa');
      setTipoGallina('Criolla');
    } 
    // 3. Pollo Hornado / Horneado: Directo a presas de Granja
    else if (nombreLimpio.includes('hornado') || nombreLimpio.includes('horneado')) {
      setTongaSeleccionada(plato);
      setConfigurandoTonga(true);
      setPasoTonga('presa');
      setTipoGallina('Granja');
    } 
    // 4. Caldo Criollo / Caldos: Directo a presas exclusivas de Caldo
    else if (nombreLimpio.includes('caldo')) {
      setTongaSeleccionada(plato);
      setConfigurandoTonga(true);
      setPasoTonga('presa');
      setTipoGallina('Caldo');
    } 
    // 5. Almuerzo del día
    else if (nombreLimpio.includes('almuerzo del día')) {
      setAlmuerzoSeleccionado(plato);
      setConfigurandoAlmuerzo(true);
      setPasoAlmuerzo('tipo');
      setSegundoElegido('');
      setSopaElegida('');
    } 
    // 6. Platos sueltos / Bebidas
    else {
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

    const esTonga = tongaSeleccionada.nombre.toLowerCase().includes('tonga');
    let precioBase = Number(tongaSeleccionada.precio);

    if (esTonga) {
      const esGranja = tipoGallina.toLowerCase().includes('granja');
      precioBase = esGranja ? 2.75 : 5.00;
      if (tipoEntrega === 'llevar') precioBase += 0.25;
    } else {
      if (tipoEntrega === 'llevar') {
        precioBase += 0.25;
      }
    }

    const detalles = `(${presa})${tipoEntrega === 'llevar' ? ' [TARRINA]' : ''}`;
    const idUnico = `${tongaSeleccionada.id}-${detalles.replace(/\s+/g, '-')}`;

    const platoConPrecioCalculado = {
      ...tongaSeleccionada,
      precio: precioBase
    };

    setCarrito((prev) => {
      const existe = prev.find((item) => item.idUnico === idUnico);
      if (existe) {
        return prev.map((item) =>
          item.idUnico === idUnico ? { ...item, grid: item.grid + 1 } : item
        );
      }
      return [...prev, { idUnico, plato: platoConPrecioCalculado, grid: 1, detallesPersonalizados: detalles }];
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

  const finalizarAlmuerzo = (bebidaFinal: string) => {
    if (!almuerzoSeleccionado) return;

    mostrarCheckCentral('Añadido');

    let detalles = '';
    const tagLlevar = tipoEntrega === 'llevar' ? ' [TARRINA]' : '';
    
    if (tipoAlmuerzo === 'completo') {
      detalles = `Completo: ${segundoElegido} + ${sopaElegida} + ${bebidaFinal}${tagLlevar}`;
    } else if (tipoAlmuerzo === 'segundo') {
      detalles = `Solo Segundo: ${segundoElegido} + ${bebidaFinal}${tagLlevar}`;
    } else if (tipoAlmuerzo === 'caldo') {
      detalles = `Solo Caldo: ${bebidaFinal}${tagLlevar}`;
    }

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
        let mesaUpdate = `${prefijoTipo}${mesa.trim()} [MESERA: ${mesera}]`;
        
        if (adicionales.length > 0) {
          const textoAdicionales = adicionales.map(a => `${a.descripcion} ($${a.precio.toFixed(2)})`).join(', ');
          mesaUpdate = `${mesaUpdate} [EXTRA: ${textoAdicionales}]`;
        }

        if (detallesExtrasTexto) {
          const separador = mesaUpdate.includes('[EXTRA:') ? ' | ' : ' [EXTRA: ';
          const cierre = mesaUpdate.includes('[EXTRA:') ? '' : ']';
          mesaUpdate = `${mesaUpdate}${separador}Especificaciones: ${detallesExtrasTexto}${cierre}`;
        }

        const { error: errorUpdate } = await supabase
          .from('pedidos')
          .update({ 
            mesa: mesaUpdate, 
            total: total 
          })
          .eq('id', idPedidoAEditar);

        if (errorUpdate) throw errorUpdate;

        await supabase.from('detalles_pedido').delete().eq('pedido_id', idPedidoAEditar);

        const detallesParaInsertar = carrito.map((item) => ({
          pedido_id: idPedidoAEditar,
          plato_id: item.plato.id,
          cantidad: item.grid,
          precio_unitario: item.plato.precio
        }));

        if (detallesParaInsertar.length > 0) {
          const { error: errorInsertDetalles } = await supabase.from('detalles_pedido').insert(detallesParaInsertar);
          if (errorInsertDetalles) throw errorInsertDetalles;
        }

        setIdPedidoAEditar(null);
      } else {
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

      if (idPedidoAEditar) {
        mostrarCheckCentral('Pedido Guardado Exitosamente');
      } else {
        mostrarCheckCentral('El pedido se ha enviado correctamente a cocina');
      }

      setCarrito([]);
      setAdicionales([]);
      setMesa('');
    } catch (error: any) {
      console.error(error);
      alert('Hubo un problema al procesar tu pedido.');
    } finally {
      setEnviando(false);
    }
  };

  const opcionesSegundos = platos.filter(p => p.categoria === 'segundo');
  const opcionesCaldos = platos.filter(p => p.categoria === 'caldo');
  const opcionesBebidas = platos.filter(p => {
    const cat = p.categoria;
    const n = p.nombre.toLowerCase();
    
    const esColaOBebidaExtra = n.includes('cola') || 
                               n.includes('litro') || 
                               n.includes('personal') || 
                               n.includes('vidrio') || 
                               n.includes('plastico') || 
                               n.includes('botella') ||
                               n.includes('agua');

    if (esColaOBebidaExtra) return false;

    return cat === 'jugo' || 
           cat === 'bebida' || 
           n.includes('quaker') || 
           n.includes('limon') || 
           n.includes('jugo') || 
           n.includes('mora') || 
           n.includes('maracuya') || 
           n.includes('chicha') ||
           n.includes('tamarindo') ||
           n.includes('horchata');
  });

  const opcionesPresasSegunGallina = () => {
    const t = tipoGallina.toLowerCase();
    if (t.includes('criolla')) return platos.filter(p => p.categoria === 'presa_criolla');
    if (t.includes('granja')) return platos.filter(p => p.categoria === 'presa_granja');
    if (t.includes('caldo')) return platos.filter(p => p.categoria === 'presa_caldo');
    return [];
  };

  const platoAlmuerzoDelDia = platos.find(p => p.nombre.toLowerCase().includes('almuerzo del día'));
  
  const restoDePlatosCatalogo = platos
    .filter(p => {
      const n = p.nombre.toLowerCase();
      return p.categoria !== 'segundo' && 
             p.categoria !== 'caldo' && 
             p.categoria !== 'presa_criolla' && 
             p.categoria !== 'presa_granja' && 
             p.categoria !== 'presa_caldo' && 
             !n.includes('almuerzo del día');
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
      
      {!autenticado && (
        <div className="fixed inset-0 bg-slate-950/80 z-[200] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white border border-gray-100 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Lock className="h-8 w-8" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-black text-gray-950 tracking-tight">Acceso Restringido</h2>
              <p className="text-xs text-gray-500 font-medium">
                Estás intentando ingresar a la interfaz de <br/>
                <strong className="text-emerald-800 font-black uppercase text-sm">"Menú de Servicio / Meseras"</strong>
              </p>
            </div>

            <form onSubmit={validarAcceso} className="space-y-4">
              <div>
                <input 
                  type="password" 
                  value={passInput} 
                  onChange={(e) => setPassInput(e.target.value)}
                  placeholder="Ingresa la contraseña de acceso..."
                  className={`w-full border rounded-2xl p-3.5 text-center font-bold text-sm outline-none transition-all ${
                    errorPass ? 'border-red-500 bg-red-50 text-red-900 focus:ring-2 focus:ring-red-400' : 'border-gray-200 bg-gray-50 focus:border-emerald-700 focus:bg-white'
                  }`}
                  autoFocus
                />
                {errorPass && <p className="text-[11px] font-bold text-red-600 mt-2">Contraseña incorrecta. Inténtalo de nuevo.</p>}
              </div>

              <button 
                type="submit" 
                className="w-full bg-emerald-700 text-white font-extrabold text-xs uppercase py-4 rounded-2xl shadow-md hover:bg-emerald-800 transition tracking-wider"
              >
                Ingresar al Sistema
              </button>
            </form>
          </div>
        </div>
      )}

      {/* BANNER SELECCIÓN DE MESERA */}
      <div className="md:col-span-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center space-x-2.5">
          <User className="h-5 w-5 text-emerald-800" />
          <div>
            <h3 className="text-sm font-bold text-emerald-950">Registro del Personal de Servicio</h3>
            <p className="text-xs text-emerald-700 font-medium">Selecciona tu nombre antes de ingresar comandas</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 justify-center w-full sm:w-auto">
          <select
            value={mesera}
            onChange={(e) => {
              setMesera(e.target.value);
              if (e.target.value) mostrarCheckCentral('Seleccionado');
            }}
            className="border border-emerald-200 text-emerald-950 font-bold text-xs rounded-xl p-2.5 bg-white outline-none focus:ring-2 focus:ring-emerald-700 w-full sm:w-44 shadow-sm"
          >
            <option value="">Seleccionar Mesera...</option>
            {listadoMeseras.map((m) => (
              <option key={m} value={m}>{m.toUpperCase()}</option>
            ))}
          </select>

          <button 
            onClick={async () => {
              const hoy = obtenerFechaLocal();
              const { data } = await supabase
                .from('pedidos')
                .select('id, mesa, total, detalles_pedido(cantidad, plato_id, precio_unitario, platos(nombre))')
                .eq('estado', 'pendiente')
                .gte('created_at', `${hoy} 00:00:00`);
              if (data) setPedidosActivos(data);
              setMostrarListaModificar(true);
            }}
            className="bg-amber-600 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-sm hover:bg-amber-700 transition flex items-center gap-1 w-full sm:w-auto justify-center"
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
                setMesa('');
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
                setMesa('');
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
                          setSegundoElegido(s.nombre);
                          if (tipoAlmuerzo === 'completo') { 
                            setPasoAlmuerzo('caldo'); 
                          } else { 
                            setPasoAlmuerzo('bebida');
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
                    <button 
                      onClick={() => {
                        setSopaElegida('Sin sopa');
                        if (tipoAlmuerzo === 'completo') setPasoAlmuerzo('bebida');
                        else finalizarAlmuerzo('Sin bebida');
                      }} 
                      className="p-3 bg-white border rounded-xl font-bold text-gray-900 hover:bg-emerald-700 hover:text-white transition text-center text-xs shadow-sm"
                    >
                      No hay caldos hoy (Pasar directo)
                    </button>
                  ) : (
                    opcionesCaldos.map((c) => (
                      <button 
                        key={c.id} 
                        disabled={!c.disponible}
                        onClick={() => {
                          if (tipoAlmuerzo === 'completo') {
                            setSopaElegida(c.nombre);
                            setPasoAlmuerzo('bebida');
                          } else {
                            finalizarAlmuerzo(c.nombre);
                          }
                        }} 
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

            {pasoAlmuerzo === 'bebida' && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-1">
                  {tipoAlmuerzo === 'completo' ? '4. Selecciona la Bebida / Jugo de hoy:' : '3. Selecciona la Bebida / Jugo de hoy:'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {opcionesBebidas.length === 0 ? (
                    <button 
                      onClick={() => finalizarAlmuerzo('Sin bebida')} 
                      className="p-3 bg-white border rounded-xl font-bold text-gray-900 hover:bg-emerald-700 hover:text-white transition text-center text-xs shadow-sm"
                    >
                      Sin Bebida / Pasar Directo
                    </button>
                  ) : (
                    opcionesBebidas.map((b) => (
                      <button 
                        key={b.id} 
                        disabled={!b.disponible}
                        onClick={() => finalizarAlmuerzo(b.nombre)} 
                        className={`p-3 border rounded-xl font-bold text-center text-xs uppercase shadow-sm transition-all ${
                          b.disponible 
                            ? 'bg-white text-gray-900 hover:bg-emerald-700 hover:text-white' 
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                        }`}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <span>{b.nombre}</span>
                          {!b.disponible && <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded uppercase">Agotado</span>}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* MODAL CONFIGURADOR TONGA, SECOS, HORNADOS Y CALDOS */}
        {configurandoTonga && (
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-emerald-100 pb-3">
              <h3 className="text-base font-bold text-emerald-950 flex items-center gap-2">
                <span>Personalizando {tongaSeleccionada?.nombre}</span>
              </h3>
              <button onClick={() => setConfigurandoTonga(false)} className="text-xs font-semibold text-gray-500 hover:text-gray-900">Cancelar</button>
            </div>
            {pasoTonga === 'tipo' ? (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">1. Tipo de preparación / Gallina</p>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => { setTipoGallina('Criolla'); setPasoTonga('presa'); }} 
                    className="p-3.5 border rounded-xl font-bold bg-white text-gray-900 hover:border-emerald-600 hover:bg-emerald-50/30 flex items-center justify-between text-sm shadow-sm"
                  >
                    <span>🐓 Gallina Criolla</span>
                    <ChevronRight className="h-4 w-4 text-emerald-700" />
                  </button>
                  <button 
                    onClick={() => { setTipoGallina('Granja'); setPasoTonga('presa'); }} 
                    className="p-3.5 border rounded-xl font-bold bg-white text-gray-900 hover:border-emerald-600 hover:bg-emerald-50/30 flex items-center justify-between text-sm shadow-sm"
                  >
                    <span>🍗 Gallina de Granja</span>
                    <ChevronRight className="h-4 w-4 text-emerald-700" />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  2. Presa disponible para {tipoGallina}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  {opcionesPresasSegunGallina().length === 0 ? (
                    <p className="text-xs text-gray-400 italic col-span-4 text-center py-3">No hay presas registradas para esta preparación.</p>
                  ) : (
                    opcionesPresasSegunGallina().map((p) => {
                      const nombreLimpioPresa = p.nombre
                        .replace(' Criolla', '')
                        .replace(' Granja', '')
                        .replace(' Caldo', '')
                        .replace(' (Palizada)', '');

                      return (
                        <button 
                          key={p.id} 
                          disabled={!p.disponible}
                          onClick={() => finalizarTonga(nombreLimpioPresa)} 
                          className={`p-3 border rounded-xl font-bold text-center text-sm shadow-sm transition-all ${
                            p.disponible 
                              ? 'bg-white text-gray-900 hover:bg-emerald-700 hover:text-white' 
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                          }`}
                        >
                          <span className="flex flex-col items-center justify-center gap-1">
                            <span>{nombreLimpioPresa}</span>
                            {!p.disponible && <span className="text-[9px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded uppercase block">Agotado</span>}
                          </span>
                        </button>
                      );
                    })
                  )}
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

        {/* RESTO DEL CATÁLOGO */}
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
                  {plato.nombre.toLowerCase().includes('tonga') ? (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                      Precio según elección
                    </span>
                  ) : (
                    <span className="text-base font-black text-emerald-800">
                      ${Number(plato.precio).toFixed(2)}
                    </span>
                  )}
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
        
        <div>
          <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
            {tipoEntrega === 'llevar' ? 'Nombre del Cliente / Identificador' : 'Mesa / Identificador'}
          </label>
          {tipoEntrega === 'llevar' ? (
            <input 
              type="text" 
              placeholder="Nombre del Cliente (Ej. Juan Pérez)" 
              value={mesa} 
              onChange={(e) => setMesa(e.target.value)} 
              className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-700 outline-none text-gray-950 bg-white shadow-sm font-bold" 
            />
          ) : (
            <select
              value={mesa}
              onChange={(e) => setMesa(e.target.value)}
              className="w-full border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-emerald-700 outline-none text-gray-950 bg-white shadow-sm font-black text-gray-800"
            >
              <option value="">Selecciona una Mesa...</option>
              {Array.from({ length: 35 }, (_, i) => i + 1).map((num) => (
                <option key={num} value={`${num}`}>{`MESA ${num}`}</option>
              ))}
            </select>
          )}
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
            <select
              value={precioAdicional}
              onChange={(e) => setPrecioAdicional(e.target.value)}
              className="w-full text-xs border rounded-lg p-2 text-gray-950 outline-none focus:border-emerald-600 bg-white font-bold text-gray-700"
              required
            >
              <option value="">Seleccionar Precio Adicional...</option>
              <option value="0.50">{"$0.50 Centavos"}</option>
              <option value="1.00">{"$1.00 Dólar"}</option>
            </select>
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
            
            <div className="max-h-80 overflow-y-auto space-y-3 pr-1 divide-y divide-gray-100">
              {pedidosActivos.length === 0 ? (
                <p className="text-center text-gray-400 text-xs py-4 italic">No hay comandas pendientes en cocina hoy.</p>
              ) : (
                pedidosActivos.map((ped) => {
                  let labelMesa = ped.mesa.includes('[TIPO:LLEVAR]') 
                    ? ped.mesa.split('[TIPO:LLEVAR]')[1].split('[MESERA:')[0].trim() 
                    : ped.mesa.split('[TIPO:SERVIR]')[1]?.split('[MESERA:')[0].trim() || ped.mesa;
                  if (labelMesa.includes('[EXTRA:')) labelMesa = labelMesa.split('[EXTRA:')[0].trim();
                  if (labelMesa.includes('Especificaciones:')) labelMesa = labelMesa.split('Especificaciones:')[0].trim();

                  let meseraOrden = 'No especificada';
                  if (ped.mesa.includes('[MESERA:')) {
                    meseraOrden = ped.mesa.split('[MESERA:')[1].split(']')[0].trim();
                  }

                  let especificacionesTexto = '';
                  if (ped.mesa.includes('Especificaciones:')) {
                    especificacionesTexto = ped.mesa.split('Especificaciones:')[1].replace(']', '').trim();
                  }

                  return (
                    <div key={ped.id} className="pt-3 first:pt-0">
                      <button 
                        onClick={() => {
                          if (meseraOrden !== 'No especificada') setMesera(meseraOrden);
                          cargarPedidoEnCarrito(ped);
                        }}
                        className="w-full text-left p-3.5 hover:bg-slate-50 transition rounded-xl flex justify-between items-start text-xs bg-gray-50/50 border border-gray-100"
                      >
                        <div className="space-y-1.5 w-full pr-2">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-gray-950 text-sm uppercase">
                              {ped.mesa.includes('[TIPO:LLEVAR]') ? `🏃‍♂️ Cliente: ${labelMesa}` : `🍽️ Mesa: ${labelMesa}`}
                            </span>
                            <span className="font-mono font-black text-emerald-800 text-sm">${Number(ped.total).toFixed(2)}</span>
                          </div>
                          
                          <div className="flex items-center gap-1 text-[11px] text-gray-500 font-medium">
                            <User className="h-3 w-3 text-emerald-700" />
                            <span>Atendido por: <strong className="text-gray-700 uppercase font-bold">{meseraOrden}</strong></span>
                          </div>

                          <div className="space-y-0.5 bg-white border border-gray-100 rounded-lg p-2 mt-1">
                            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">Composición:</p>
                            {ped.detalles_pedido?.map((det: any, idx: number) => (
                              <p key={idx} className="text-xs text-gray-700 font-medium capitalize flex justify-between">
                                <span>• {det.platos?.nombre}</span>
                                <span className="font-bold text-gray-400 text-[11px]">x{det.cantidad}</span>
                              </p>
                            ))}
                            
                            {especificacionesTexto && (
                              <p className="text-[11px] text-amber-800 font-semibold italic border-t border-dashed mt-1.5 pt-1 capitalize">
                                📝 {especificacionesTexto}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-emerald-700 shrink-0 self-center" />
                      </button>
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