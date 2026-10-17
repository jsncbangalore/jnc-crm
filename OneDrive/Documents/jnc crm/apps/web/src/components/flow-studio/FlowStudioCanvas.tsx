import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Save, RotateCcw, Plus, Trash2, ArrowRight, CheckCircle2,
  Clock, Mail, MessageSquare, Phone, GitBranch, ShieldCheck,
  AlertCircle, Sparkles, Sliders, ChevronRight, Zap, Info, X,
  Hand, MousePointer, ZoomIn, ZoomOut, Maximize2,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen,
  Move, HelpCircle, Eye, EyeOff
} from 'lucide-react';

export type NodeType = 'START' | 'SEND_WHATSAPP' | 'SEND_EMAIL' | 'SEND_SMS' | 'WAIT' | 'CONDITION' | 'EXIT';

export interface FlowNode {
  id: string;
  type: NodeType;
  label?: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowSequence {
  id: string;
  title: string;
  status: 'ACTIVE' | 'DRAFT';
  triggerType: 'NEW_LEAD' | 'DEAL_STAGE_CHANGE' | 'INDIAMART_NEW_LEAD';
  triggerStage?: string;
  triggerSource?: string;
  filterMode?: 'ALL' | 'ANY' | 'NONE';
  sourceFilters?: Array<{ field: string; operator: string; value: string }>;
  canvas: {
    nodes: FlowNode[];
    edges: FlowEdge[];
  };
}

const DEFAULT_SEQUENCE: FlowSequence = {
  id: 'sequence-follow-up',
  title: 'Automated Lead Nurturing & Multi-Channel Sequence',
  status: 'ACTIVE',
  triggerType: 'NEW_LEAD',
  triggerStage: 'PROPOSAL',
  triggerSource: 'ANY',
  filterMode: 'ALL',
  sourceFilters: [
    { field: 'source', operator: 'equals', value: 'INDIAMART' }
  ],
  canvas: {
    nodes: [
      {
        id: 'start',
        type: 'START',
        label: 'Inbound Lead Trigger',
        config: {},
        position: { x: 50, y: 180 },
      },
      {
        id: 'email',
        type: 'SEND_EMAIL',
        label: 'Send Official Proposal',
        config: {
          subject: 'Thank you for your inquiry - JNC Commercial Proposal',
          message: 'Thank you for reaching out to JS Network Communication. We have reviewed your requirement and attached our commercial quotation.',
        },
        position: { x: 330, y: 180 },
      },
      {
        id: 'wait',
        type: 'WAIT',
        label: 'Wait 24 Hours',
        config: { hours: 24 },
        position: { x: 610, y: 180 },
      },
      {
        id: 'condition',
        type: 'CONDITION',
        label: 'Deal In Proposal?',
        config: { field: 'deal.stage', equals: 'PROPOSAL' },
        position: { x: 890, y: 180 },
      },
      {
        id: 'whatsapp',
        type: 'SEND_WHATSAPP',
        label: 'WhatsApp Follow-up',
        config: {
          message: 'Hi! We shared the proposal yesterday. Do you have any questions or require site visit inspection?',
        },
        position: { x: 1180, y: 90 },
      },
      {
        id: 'exit',
        type: 'EXIT',
        label: 'End Sequence',
        config: {},
        position: { x: 1180, y: 310 },
      },
    ],
    edges: [
      { from: 'start', to: 'email' },
      { from: 'email', to: 'wait' },
      { from: 'wait', to: 'condition' },
      { from: 'condition', to: 'whatsapp', label: 'yes' },
      { from: 'condition', to: 'exit', label: 'no' },
      { from: 'whatsapp', to: 'exit' },
    ],
  },
};

const NODE_CONFIG: Record<NodeType, { label: string; icon: any; color: string; badge: string }> = {
  START: { label: 'Trigger', icon: Zap, color: 'border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-amber-500', badge: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' },
  SEND_WHATSAPP: { label: 'Send WhatsApp', icon: MessageSquare, color: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500', badge: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
  SEND_EMAIL: { label: 'Send Email', icon: Mail, color: 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-blue-500', badge: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
  SEND_SMS: { label: 'Send SMS', icon: Phone, color: 'border-purple-500 bg-purple-50 dark:bg-purple-950/20 text-purple-500', badge: 'bg-purple-500/20 text-purple-600 dark:text-purple-400' },
  WAIT: { label: 'Delay Wait', icon: Clock, color: 'border-slate-400 bg-slate-50 dark:bg-slate-800/40 text-slate-500', badge: 'bg-slate-500/20 text-slate-600 dark:text-slate-400' },
  CONDITION: { label: 'Condition (IF)', icon: GitBranch, color: 'border-orange-400 bg-orange-50 dark:bg-orange-950/20 text-orange-500', badge: 'bg-orange-500/20 text-orange-600 dark:text-orange-400' },
  EXIT: { label: 'Exit Flow', icon: ArrowRight, color: 'border-rose-400 bg-rose-50 dark:bg-rose-950/20 text-rose-500', badge: 'bg-rose-500/20 text-rose-600 dark:text-rose-400' },
};

const NODE_WIDTH = 210;
const NODE_HEIGHT = 80;

export default function FlowStudioCanvas() {
  const [sequence, setSequence] = useState<FlowSequence>(() => {
    try {
      const saved = localStorage.getItem('jnc_crmflow_sequence');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return DEFAULT_SEQUENCE;
  });

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('start');
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDirty, setIsDirty] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedNodeId, setSimulatedNodeId] = useState<string | null>(null);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isConditionBannerDismissed, setIsConditionBannerDismissed] = useState(false);

  // ─── PHOTO EDITOR & PAN/ZOOM NAVIGATION STATES ───
  const [activeTool, setActiveTool] = useState<'select' | 'hand'>('select');
  const [zoom, setZoom] = useState<number>(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // ─── COLLAPSIBLE PANELS (HIDE / UNHIDE) ───
  const [showLeftPalette, setShowLeftPalette] = useState(true);
  const [showRightInspector, setShowRightInspector] = useState(true);

  const canvasRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // ─── KEYBOARD SHORTCUTS (SPACE FOR HAND TOOL, V FOR SELECT, H FOR HAND, ESC TO CANCEL) ───
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      } else if (e.key === 'v' || e.key === 'V') {
        setActiveTool('select');
      } else if (e.key === 'h' || e.key === 'H') {
        setActiveTool('hand');
      } else if (e.key === 'Escape') {
        if (connectFromId) setConnectFromId(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId && selectedNodeId !== 'start') {
          handleDeleteNode(selectedNodeId);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [connectFromId, selectedNodeId]);

  const handleSave = (statusOverride?: 'ACTIVE' | 'DRAFT') => {
    const updated = {
      ...sequence,
      status: statusOverride || sequence.status,
    };
    setSequence(updated);
    try {
      localStorage.setItem('jnc_crmflow_sequence', JSON.stringify(updated));
      setIsDirty(false);
      showToast(statusOverride === 'ACTIVE' ? 'Flow sequence activated & deployed!' : 'Flow sequence saved successfully');
    } catch {
      showToast('Error saving flow configuration');
    }
  };

  const handleResetToTemplate = () => {
    setShowResetConfirmModal(true);
  };

  const confirmResetToTemplate = () => {
    setShowResetConfirmModal(false);
    setSequence(DEFAULT_SEQUENCE);
    setSelectedNodeId('start');
    setConnectFromId(null);
    setIsDirty(false);
    localStorage.setItem('jnc_crmflow_sequence', JSON.stringify(DEFAULT_SEQUENCE));
    showToast('Flow reset to default template');
  };

  // ─── CANVAS PANNING & NODE DRAGGING HANDLERS ───
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const isOnNode = !!target.closest('.flow-node-card');
    const isOnPort = !!target.closest('.port-btn');
    const isOnButton = !!target.closest('button, input, select, textarea');

    // Pan canvas if: Hand tool is active, Space is held, Middle mouse clicked, or clicked on empty background
    if (activeTool === 'hand' || isSpacePressed || e.button === 1 || (!isOnNode && !isOnPort && !isOnButton)) {
      setIsPanning(true);
      setPanStart({
        x: e.clientX,
        y: e.clientY,
        scrollLeft: canvasRef.current?.scrollLeft || 0,
        scrollTop: canvasRef.current?.scrollTop || 0,
      });
      canvasRef.current?.setPointerCapture(e.pointerId);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent) => {
    // 1. Canvas Panning
    if (isPanning && canvasRef.current) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      canvasRef.current.scrollLeft = panStart.scrollLeft - dx;
      canvasRef.current.scrollTop = panStart.scrollTop - dy;
      return;
    }

    // 2. Node Dragging (Zoom compensated)
    if (draggingNodeId && canvasRef.current) {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const rawX = (e.clientX - canvasRect.left + canvasRef.current.scrollLeft) / zoom - dragOffset.x;
      const rawY = (e.clientY - canvasRect.top + canvasRef.current.scrollTop) / zoom - dragOffset.y;

      const newX = Math.round(Math.max(20, Math.min(2200 - NODE_WIDTH, rawX)));
      const newY = Math.round(Math.max(20, Math.min(1400 - NODE_HEIGHT, rawY)));

      setSequence((prev) => ({
        ...prev,
        canvas: {
          ...prev.canvas,
          nodes: prev.canvas.nodes.map((n) => (n.id === draggingNodeId ? { ...n, position: { x: newX, y: newY } } : n)),
        },
      }));
      setIsDirty(true);
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {}
    }
    if (draggingNodeId) {
      setDraggingNodeId(null);
    }
  };

  // Node Drag Down (Select Tool Only)
  const handlePointerDownNode = (e: React.PointerEvent, node: FlowNode) => {
    // If hand tool is active or space is pressed, let the canvas pan instead
    if (activeTool === 'hand' || isSpacePressed || e.button === 1) return;
    if ((e.target as HTMLElement).closest('.port-btn')) return;

    e.stopPropagation();
    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUpNode = (e: React.PointerEvent) => {
    if (draggingNodeId) {
      setDraggingNodeId(null);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Connect Port Handler
  const handlePortClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (!connectFromId) {
      setConnectFromId(nodeId);
      showToast(`Selected source node. Now click target node to create link.`);
    } else if (connectFromId === nodeId) {
      setConnectFromId(null);
    } else {
      const sourceNode = sequence.canvas.nodes.find((n) => n.id === connectFromId);
      const isCondition = sourceNode?.type === 'CONDITION';
      const existingFromEdges = sequence.canvas.edges.filter((edge) => edge.from === connectFromId);

      let branchLabel: string | undefined = undefined;
      if (isCondition) {
        branchLabel = existingFromEdges.length === 0 ? 'yes' : existingFromEdges.length === 1 ? 'no' : undefined;
      }

      // Avoid duplicates
      const exists = sequence.canvas.edges.some((edge) => edge.from === connectFromId && edge.to === nodeId);
      if (!exists) {
        setSequence((prev) => ({
          ...prev,
          canvas: {
            ...prev.canvas,
            edges: [...prev.canvas.edges, { from: connectFromId, to: nodeId, label: branchLabel }],
          },
        }));
        setIsDirty(true);
        showToast('Nodes connected');
      }
      setConnectFromId(null);
    }
  };

  // Add Step from Palette
  const handleAddStep = (type: NodeType) => {
    const newId = `${type.toLowerCase()}_${Date.now().toString(36)}`;
    const selNode = sequence.canvas.nodes.find((n) => n.id === selectedNodeId);
    const baseX = selNode ? selNode.position.x + 280 : 300;
    const baseY = selNode ? selNode.position.y : 200;

    const newNode: FlowNode = {
      id: newId,
      type,
      label: NODE_CONFIG[type].label,
      config: type === 'WAIT' ? { hours: 24 } : type === 'CONDITION' ? { field: 'deal.stage', equals: 'QUALIFIED' } : { message: '' },
      position: { x: baseX, y: baseY },
    };

    const newEdges = [...sequence.canvas.edges];
    if (selectedNodeId && selectedNodeId !== 'exit') {
      newEdges.push({ from: selectedNodeId, to: newId });
    }

    setSequence((prev) => ({
      ...prev,
      canvas: {
        nodes: [...prev.canvas.nodes, newNode],
        edges: newEdges,
      },
    }));
    setSelectedNodeId(newId);
    setIsDirty(true);
    showToast(`Added ${NODE_CONFIG[type].label}`);
  };

  // Delete Selected Node
  const handleDeleteNode = (id: string) => {
    if (id === 'start') {
      showToast('The Start Trigger node cannot be removed.');
      return;
    }
    setSequence((prev) => ({
      ...prev,
      canvas: {
        nodes: prev.canvas.nodes.filter((n) => n.id !== id),
        edges: prev.canvas.edges.filter((e) => e.from !== id && e.to !== id),
      },
    }));
    setSelectedNodeId(null);
    setIsDirty(true);
    showToast('Node removed from flow');
  };

  // Test Run Simulation
  const handleRunSimulation = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    showToast('Starting real-time sequence simulation...');

    const path: string[] = ['start'];
    let curr = 'start';
    while (curr) {
      const edge = sequence.canvas.edges.find((e) => e.from === curr && (e.label === 'yes' || !e.label));
      if (edge) {
        path.push(edge.to);
        curr = edge.to;
      } else {
        break;
      }
    }

    for (const stepId of path) {
      setSimulatedNodeId(stepId);
      await new Promise((r) => setTimeout(r, 700));
    }
    await new Promise((r) => setTimeout(r, 600));
    setSimulatedNodeId(null);
    setIsSimulating(false);
    showToast('Sequence simulation finished successfully!');
  };

  // Zoom Helpers
  const zoomIn = () => setZoom((z) => Math.min(1.75, Number((z + 0.15).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))));
  const resetZoom = () => {
    setZoom(1.0);
    if (canvasRef.current) {
      canvasRef.current.scrollTo({ left: 0, top: 40, behavior: 'smooth' });
    }
  };

  // SVG Curve Calculator
  const getCurvePath = (edge: FlowEdge) => {
    const fromNode = sequence.canvas.nodes.find((n) => n.id === edge.from);
    const toNode = sequence.canvas.nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return '';

    const x1 = fromNode.position.x + NODE_WIDTH;
    const y1 = fromNode.position.y + NODE_HEIGHT / 2;
    const x2 = toNode.position.x;
    const y2 = toNode.position.y + NODE_HEIGHT / 2;

    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  const getEdgeMidpoint = (edge: FlowEdge) => {
    const fromNode = sequence.canvas.nodes.find((n) => n.id === edge.from);
    const toNode = sequence.canvas.nodes.find((n) => n.id === edge.to);
    if (!fromNode || !toNode) return { x: 0, y: 0 };
    return {
      x: (fromNode.position.x + NODE_WIDTH + toNode.position.x) / 2,
      y: (fromNode.position.y + toNode.position.y) / 2 + NODE_HEIGHT / 2,
    };
  };

  // Condition evaluation check for warning banner: only trigger when condition checks deal.stage = PROPOSAL
  const hasProposalConditionOnNewLead =
    !isConditionBannerDismissed &&
    sequence.triggerType === 'NEW_LEAD' &&
    sequence.canvas.nodes.some(
      (n) => n.type === 'CONDITION' && (n.config?.equals === 'PROPOSAL' || (n.config?.field === 'deal.stage' && n.config?.equals !== 'QUALIFIED'))
    );

  const fixConditionToQualified = () => {
    setSequence((prev) => {
      const updatedNodes = prev.canvas.nodes.map((n) =>
        n.type === 'CONDITION'
          ? { ...n, label: 'Deal In Qualified?', config: { ...n.config, field: 'deal.stage', equals: 'QUALIFIED' } }
          : n
      );
      const updated = {
        ...prev,
        canvas: {
          ...prev.canvas,
          nodes: updatedNodes,
        },
      };
      try {
        localStorage.setItem('jnc_crmflow_sequence', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    setIsConditionBannerDismissed(true);
    setIsDirty(true);
    showToast('Condition fixed: now checks for QUALIFIED stage');
  };

  const selectedNode = sequence.canvas.nodes.find((n) => n.id === selectedNodeId);

  // Mouse cursor based on current tool mode
  const canvasCursor = isPanning
    ? 'cursor-grabbing'
    : activeTool === 'hand' || isSpacePressed
    ? 'cursor-grab'
    : 'cursor-default';

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-[#11141E] rounded-2xl border border-slate-200 dark:border-[#2A3042] overflow-hidden shadow-sm relative antialiased">
      {/* ═══════════════════════════════════════════════════════════════════════
          STUDIO TOOLBAR: TITLE, TOOLS, PANELS HIDE/UNHIDE, AND ACTIONS
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="h-14 px-4 bg-white dark:bg-[#181B26] border-b border-slate-200 dark:border-[#2A3042] flex items-center justify-between shrink-0 gap-3 flex-wrap z-20">
        
        {/* LEFT: TITLE & STATUS */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-1.5 rounded-lg bg-crm-teal/15 text-crm-teal shrink-0">
            <Sliders size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={sequence.title}
                onChange={(e) => {
                  setSequence({ ...sequence, title: e.target.value });
                  setIsDirty(true);
                }}
                className="text-xs sm:text-sm font-black text-slate-900 dark:text-white bg-transparent border-b border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-crm-blue outline-none transition-colors w-48 sm:w-80 truncate"
                placeholder="Workflow Sequence Title"
              />
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                  sequence.status === 'ACTIVE'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-500/15 text-slate-500 border border-slate-500/30'
                }`}
              >
                {isDirty ? 'UNSAVED' : sequence.status}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 truncate hidden md:block">
              Drag nodes, pan canvas with hand tool or background drag, zoom with controls.
            </p>
          </div>
        </div>

        {/* CENTER: PHOTO EDITOR TOOL TOGGLES & SIDE PANEL TOGGLES */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#11141E] p-1 rounded-xl border border-slate-200/90 dark:border-[#2A3042]">
          {/* Select Tool (V) */}
          <button
            type="button"
            onClick={() => setActiveTool('select')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTool === 'select'
                ? 'bg-white dark:bg-[#202738] text-crm-blue dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Select &amp; Connect Tool (Shortcut: V)"
          >
            <MousePointer size={14} />
            <span className="hidden sm:inline">Select (V)</span>
          </button>

          {/* Hand / Pan Tool (H / Space) */}
          <button
            type="button"
            onClick={() => setActiveTool('hand')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTool === 'hand'
                ? 'bg-white dark:bg-[#202738] text-crm-blue dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Hand Move / Pan Tool (Shortcut: H or Hold Spacebar)"
          >
            <Hand size={14} />
            <span className="hidden sm:inline">Pan (H)</span>
          </button>
        </div>

        {/* RIGHT: SIMULATE, RESET, SAVE DRAFT, ACTIVATE */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] hover:bg-slate-50 dark:hover:bg-[#202738] transition-colors cursor-pointer text-slate-700 dark:text-slate-200"
            title="Simulate workflow execution with live step highlighting"
          >
            <Play size={13} className={isSimulating ? 'animate-spin text-amber-500' : 'text-crm-teal'} />
            <span className="hidden sm:inline">{isSimulating ? 'Running...' : 'Simulate'}</span>
          </button>

          <button
            type="button"
            onClick={handleResetToTemplate}
            className="p-2 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] hover:bg-slate-50 dark:hover:bg-[#202738] text-slate-500 transition-colors cursor-pointer"
            title="Reset to default multi-channel template"
          >
            <RotateCcw size={14} />
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] hover:bg-slate-50 dark:hover:bg-[#202738] text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <Save size={13} />
            <span className="hidden sm:inline">Save Draft</span>
          </button>

          <button
            type="button"
            onClick={() => handleSave('ACTIVE')}
            className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-crm-blue hover:bg-crm-blue-hover text-white shadow-xs transition-colors cursor-pointer"
          >
            <CheckCircle2 size={13} />
            <span>Activate Flow</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          OPTIONAL WARNING BANNER: CONDITION MISMATCH FOR NEW LEADS
          ═══════════════════════════════════════════════════════════════════════ */}
      {hasProposalConditionOnNewLead && (
        <div className="px-4 py-2 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between gap-3 text-xs z-10 animate-in fade-in">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold">
            <AlertCircle size={15} className="text-amber-500 shrink-0" />
            <span>
              <strong>Condition Notice:</strong> New inbound leads start at stage <code>QUALIFIED</code>, but your flow checks <code>deal.stage = PROPOSAL</code> (always false initially).
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={fixConditionToQualified}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-xs cursor-pointer shrink-0 transition-colors"
            >
              Fix Condition to QUALIFIED
            </button>
            <button
              type="button"
              onClick={() => setIsConditionBannerDismissed(true)}
              className="p-1 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
              title="Dismiss Notice"
              aria-label="Dismiss Notice"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MAIN WORKSPACE: LEFT PALETTE | CANVAS | RIGHT INSPECTOR
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* ─── LEFT PALETTE: TRIGGER & STEP BUTTONS (COLLAPSIBLE) ─── */}
        {showLeftPalette && (
          <div className="w-64 bg-white dark:bg-[#151824] border-r border-slate-200 dark:border-[#2A3042] p-4 flex flex-col gap-4 overflow-y-auto shrink-0 z-10 transition-all duration-200">
            {/* PALETTE HEADER WITH HIDE BUTTON */}
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-white/5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Workflow Trigger
              </span>
              <button
                type="button"
                onClick={() => setShowLeftPalette(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                title="Hide Step Palette"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>

            {/* TRIGGER SELECTOR */}
            <div className="p-3 bg-slate-50 dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Inbound Event</span>
                <Zap size={13} className="text-amber-500" />
              </div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 block">
                When sequence triggers:
              </label>
              <select
                value={sequence.triggerType}
                onChange={(e: any) => {
                  setSequence({ ...sequence, triggerType: e.target.value });
                  setIsDirty(true);
                }}
                className="w-full text-xs rounded-lg border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#11141E] p-2 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
              >
                <option value="NEW_LEAD">New Lead (Any Inbound Channel)</option>
                <option value="INDIAMART_NEW_LEAD">New IndiaMART Push Lead</option>
                <option value="DEAL_STAGE_CHANGE">Deal Moves to Stage</option>
              </select>

              {sequence.triggerType === 'DEAL_STAGE_CHANGE' && (
                <div className="pt-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Target Stage</label>
                  <select
                    value={sequence.triggerStage || 'PROPOSAL'}
                    onChange={(e) => {
                      setSequence({ ...sequence, triggerStage: e.target.value });
                      setIsDirty(true);
                    }}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#11141E] p-1.5 mt-1 text-slate-800 dark:text-slate-200"
                  >
                    <option value="QUALIFIED">QUALIFIED</option>
                    <option value="PROPOSAL">PROPOSAL</option>
                    <option value="NEGOTIATION">NEGOTIATION</option>
                    <option value="WON">WON</option>
                    <option value="LOST">LOST</option>
                  </select>
                </div>
              )}
            </div>

            {/* PALETTE: ADD STEP BUTTONS */}
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Add Automation Step</span>
              <div className="grid grid-cols-1 gap-1.5">
                {(['SEND_WHATSAPP', 'SEND_EMAIL', 'SEND_SMS', 'WAIT', 'CONDITION', 'EXIT'] as NodeType[]).map((type) => {
                  const conf = NODE_CONFIG[type];
                  const Icon = conf.icon;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleAddStep(type)}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] hover:bg-slate-50 dark:hover:bg-[#1E2230] hover:border-crm-blue/50 transition-all text-left text-xs font-semibold text-slate-800 dark:text-slate-200 group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg border ${conf.color}`}>
                          <Icon size={14} />
                        </div>
                        <span>{conf.label}</span>
                      </div>
                      <Plus size={14} className="text-slate-400 group-hover:text-crm-blue transition-colors" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* QUICK NAVIGATION HINT */}
            <div className="mt-auto p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/30 text-[11px] text-blue-700 dark:text-blue-300 space-y-1">
              <div className="flex items-center gap-1 font-bold">
                <Info size={13} />
                <span>Canvas Navigation</span>
              </div>
              <p className="text-[10px] leading-relaxed text-blue-600/90 dark:text-blue-300/80">
                Hold <strong>Spacebar</strong> or use the <strong>Hand tool (H)</strong> to pan freely like a photo editor. Click <strong>(+)</strong> ports to link steps.
              </p>
            </div>
          </div>
        )}

        {/* ─── FLOATING UNHIDE STEPS PALETTE BUTTON (WHEN HIDDEN) ─── */}
        {!showLeftPalette && (
          <button
            type="button"
            onClick={() => setShowLeftPalette(true)}
            className="absolute left-3 top-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-md text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-crm-blue transition-all cursor-pointer"
            title="Unhide Steps Palette"
          >
            <PanelLeftOpen size={14} className="text-crm-teal" />
            <span>Show Steps</span>
          </button>
        )}

        {/* ─── FLOATING UNHIDE INSPECTOR BUTTON (WHEN HIDDEN) ─── */}
        {!showRightInspector && (
          <button
            type="button"
            onClick={() => setShowRightInspector(true)}
            className="absolute right-3 top-3 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] shadow-md text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-crm-blue transition-all cursor-pointer"
            title="Unhide Step Inspector"
          >
            <PanelRightOpen size={14} className="text-crm-teal" />
            <span>Show Inspector</span>
          </button>
        )}

        {/* ─── MIDDLE: INTERACTIVE CANVAS WITH PAN & ZOOM ─── */}
        <div
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          className={`flex-1 overflow-auto bg-slate-100/70 dark:bg-[#0E111A] relative select-none ${canvasCursor}`}
          style={{
            backgroundImage: 'radial-gradient(rgba(100, 116, 139, 0.22) 1px, transparent 1px)',
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          }}
          onClick={() => {
            if (connectFromId) setConnectFromId(null);
          }}
        >
          {/* ACTIVE PORT CONNECTION BANNER */}
          {connectFromId && (
            <div className="sticky top-4 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-crm-blue text-white text-xs font-bold shadow-lg animate-pulse">
              <span>Connecting from &ldquo;{sequence.canvas.nodes.find((n) => n.id === connectFromId)?.label}&rdquo;</span>
              <span className="text-white/80 text-[10px]">&mdash; click target node or ESC to cancel</span>
              <button
                type="button"
                onClick={() => setConnectFromId(null)}
                className="ml-1 p-0.5 rounded-full hover:bg-white/20 cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* SCALED CANVAS CONTENT WRAPPER */}
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              width: '2400px',
              height: '1600px',
            }}
            className="relative p-10"
          >
            {/* SVG EDGES / CONNECTING BEZIER CURVES */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#94A3B8" />
                </marker>
                <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 9 5 L 0 9 z" fill="#2E5EFF" />
                </marker>
              </defs>

              {sequence.canvas.edges.map((edge, idx) => {
                const d = getCurvePath(edge);
                const mid = getEdgeMidpoint(edge);
                const isActive = simulatedNodeId === edge.from || simulatedNodeId === edge.to;
                return (
                  <g key={`${edge.from}-${edge.to}-${idx}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={isActive ? '#2E5EFF' : '#94A3B8'}
                      strokeWidth={isActive ? 3 : 2}
                      strokeDasharray={edge.label === 'no' ? '5,5' : undefined}
                      markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow)'}
                      className="transition-colors duration-200"
                    />
                    {edge.label && (
                      <g transform={`translate(${mid.x - 16}, ${mid.y - 10})`}>
                        <rect
                          width="32"
                          height="18"
                          rx="9"
                          fill={edge.label === 'yes' ? '#10B981' : '#F43F5E'}
                          className="shadow-sm"
                        />
                        <text
                          x="16"
                          y="13"
                          fill="#ffffff"
                          fontSize="10"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {edge.label.toUpperCase()}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* CANVAS NODES */}
            {sequence.canvas.nodes.map((node) => {
              const conf = NODE_CONFIG[node.type];
              const Icon = conf.icon;
              const isSelected = selectedNodeId === node.id;
              const isSimActive = simulatedNodeId === node.id;
              const isConnectSource = connectFromId === node.id;

              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => handlePointerDownNode(e, node)}
                  onPointerUp={handlePointerUpNode}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (connectFromId && connectFromId !== node.id) {
                      handlePortClick(e, node.id);
                    } else {
                      setSelectedNodeId(node.id);
                    }
                  }}
                  style={{
                    left: `${node.position.x}px`,
                    top: `${node.position.y}px`,
                    width: `${NODE_WIDTH}px`,
                    minHeight: `${NODE_HEIGHT}px`,
                  }}
                  className={`flow-node-card absolute rounded-xl border p-3 transition-shadow z-10 ${
                    activeTool === 'hand' || isSpacePressed ? 'cursor-grab' : 'cursor-grab active:cursor-grabbing'
                  } ${
                    isSelected
                      ? 'border-crm-blue ring-2 ring-crm-blue/40 bg-white dark:bg-[#181B26] shadow-xl'
                      : isSimActive
                      ? 'border-amber-400 ring-4 ring-amber-400/40 bg-amber-50 dark:bg-amber-950/30 shadow-xl'
                      : isConnectSource
                      ? 'border-crm-teal ring-2 ring-crm-teal bg-teal-50 dark:bg-teal-950/30 shadow-md'
                      : 'border-slate-200 dark:border-[#2A3042] bg-white dark:bg-[#181B26] shadow-sm hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg border ${conf.color}`}>
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                          {node.label || conf.label}
                        </p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${conf.badge}`}>
                          {node.type}
                        </span>
                      </div>
                    </div>

                    {/* CONNECT PORT (+) BUTTON */}
                    {node.type !== 'EXIT' && (
                      <button
                        type="button"
                        onClick={(e) => handlePortClick(e, node.id)}
                        className={`port-btn w-6 h-6 rounded-full border flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                          isConnectSource
                            ? 'bg-crm-blue text-white border-crm-blue'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-crm-blue border-slate-200 dark:border-slate-700'
                        }`}
                        title="Click to connect this step to another node"
                      >
                        <Plus size={12} />
                      </button>
                    )}
                  </div>

                  {/* SUMMARY SNIPPET */}
                  <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">
                    {node.type === 'WAIT' && `Delay: ${node.config?.hours || 24} hours`}
                    {node.type === 'CONDITION' && `IF ${node.config?.field || 'deal.stage'} = ${node.config?.equals || 'QUALIFIED'}`}
                    {node.type === 'SEND_WHATSAPP' && (node.config?.message ? `"${node.config.message}"` : 'Automated WhatsApp')}
                    {node.type === 'SEND_EMAIL' && (node.config?.subject ? `${node.config.subject}` : 'Proposal Email')}
                    {node.type === 'SEND_SMS' && (node.config?.message ? `"${node.config.message}"` : 'SMS Notification')}
                    {node.type === 'START' && 'Inbound Deal Ingestion'}
                    {node.type === 'EXIT' && 'Sequence Termination'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── FLOATING PHOTO EDITOR CONTROLS (PAN, ZOOM, RESET) ─── */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white/95 dark:bg-[#181B26]/95 backdrop-blur-md border border-slate-200 dark:border-[#2A3042] shadow-xl">
          <button
            type="button"
            onClick={() => setActiveTool('select')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTool === 'select'
                ? 'bg-crm-blue text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
            title="Select Tool (V)"
          >
            <MousePointer size={14} />
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('hand')}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTool === 'hand'
                ? 'bg-crm-blue text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
            title="Hand Pan Tool (H / Space)"
          >
            <Hand size={14} />
          </button>

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={zoomOut}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Zoom Out (-)"
          >
            <ZoomOut size={14} />
          </button>

          <button
            type="button"
            onClick={resetZoom}
            className="px-2 py-0.5 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 rounded transition-colors cursor-pointer"
            title="Reset to 100% (Fit)"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            onClick={zoomIn}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Zoom In (+)"
          >
            <ZoomIn size={14} />
          </button>

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={resetZoom}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            title="Center Canvas View"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        {/* ─── RIGHT INSPECTOR SIDEBAR (COLLAPSIBLE) ─── */}
        {showRightInspector && (
          <div className="w-80 bg-white dark:bg-[#151824] border-l border-slate-200 dark:border-[#2A3042] p-5 flex flex-col gap-4 overflow-y-auto shrink-0 z-10 transition-all duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#2A3042]">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Step Inspector</span>
              <div className="flex items-center gap-1">
                {selectedNode && selectedNode.id !== 'start' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteNode(selectedNode.id)}
                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                    title="Delete this step"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowRightInspector(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  title="Hide Inspector"
                >
                  <PanelRightClose size={14} />
                </button>
              </div>
            </div>

            {selectedNode ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Step Display Title
                  </label>
                  <input
                    type="text"
                    value={selectedNode.label || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSequence((prev) => ({
                        ...prev,
                        canvas: {
                          ...prev.canvas,
                          nodes: prev.canvas.nodes.map((n) => (n.id === selectedNode.id ? { ...n, label: val } : n)),
                        },
                      }));
                      setIsDirty(true);
                    }}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] p-2.5 text-slate-800 dark:text-slate-200 outline-none focus:border-crm-blue"
                  />
                </div>

                {/* SPECIFIC CONFIGURATION BY NODE TYPE */}
                {selectedNode.type === 'SEND_EMAIL' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                        Email Subject
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config?.subject || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSequence((prev) => ({
                            ...prev,
                            canvas: {
                              ...prev.canvas,
                              nodes: prev.canvas.nodes.map((n) =>
                                n.id === selectedNode.id ? { ...n, config: { ...n.config, subject: val } } : n
                              ),
                            },
                          }));
                          setIsDirty(true);
                        }}
                        className="w-full text-xs rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] p-2.5 text-slate-800 dark:text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                        Message Body
                      </label>
                      <textarea
                        rows={5}
                        value={selectedNode.config?.message || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSequence((prev) => ({
                            ...prev,
                            canvas: {
                              ...prev.canvas,
                              nodes: prev.canvas.nodes.map((n) =>
                                n.id === selectedNode.id ? { ...n, config: { ...n.config, message: val } } : n
                              ),
                            },
                          }));
                          setIsDirty(true);
                        }}
                        className="w-full text-xs rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] p-2.5 text-slate-800 dark:text-slate-200"
                      />
                    </div>
                  </div>
                )}

                {selectedNode.type === 'SEND_WHATSAPP' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                        WhatsApp Message Text
                      </label>
                      <textarea
                        rows={4}
                        value={selectedNode.config?.message || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSequence((prev) => ({
                            ...prev,
                            canvas: {
                              ...prev.canvas,
                              nodes: prev.canvas.nodes.map((n) =>
                                n.id === selectedNode.id ? { ...n, config: { ...n.config, message: val } } : n
                              ),
                            },
                          }));
                          setIsDirty(true);
                        }}
                        className="w-full text-xs rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] p-2.5 text-slate-800 dark:text-slate-200"
                      />
                    </div>
                  </div>
                )}

                {selectedNode.type === 'WAIT' && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                      Delay Duration (Hours)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={selectedNode.config?.hours || 24}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 1;
                        setSequence((prev) => ({
                          ...prev,
                          canvas: {
                            ...prev.canvas,
                            nodes: prev.canvas.nodes.map((n) =>
                              n.id === selectedNode.id ? { ...n, config: { ...n.config, hours: val } } : n
                            ),
                          },
                        }));
                        setIsDirty(true);
                      }}
                      className="w-full text-xs rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] p-2.5 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                )}

                {selectedNode.type === 'CONDITION' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                        Evaluate Lead Field
                      </label>
                      <select
                        value={selectedNode.config?.field || 'deal.stage'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSequence((prev) => ({
                            ...prev,
                            canvas: {
                              ...prev.canvas,
                              nodes: prev.canvas.nodes.map((n) =>
                                n.id === selectedNode.id ? { ...n, config: { ...n.config, field: val } } : n
                              ),
                            },
                          }));
                          setIsDirty(true);
                        }}
                        className="w-full text-xs rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] p-2.5 text-slate-800 dark:text-slate-200"
                      >
                        <option value="deal.stage">Deal Stage</option>
                        <option value="deal.value">Deal Value</option>
                        <option value="deal.source">Inbound Source</option>
                        <option value="deal.city">Location City</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                        Must Equal Value
                      </label>
                      <input
                        type="text"
                        value={selectedNode.config?.equals || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSequence((prev) => ({
                            ...prev,
                            canvas: {
                              ...prev.canvas,
                              nodes: prev.canvas.nodes.map((n) =>
                                n.id === selectedNode.id ? { ...n, config: { ...n.config, equals: val } } : n
                              ),
                            },
                          }));
                          setIsDirty(true);
                        }}
                        className="w-full text-xs rounded-xl border border-slate-200 dark:border-[#2A3042] bg-slate-50 dark:bg-[#11141E] p-2.5 text-slate-800 dark:text-slate-200"
                      />
                    </div>
                  </div>
                )}

                {selectedNode.id !== 'start' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteNode(selectedNode.id)}
                    className="w-full mt-4 flex items-center justify-center gap-2 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Remove Step From Flow</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Sliders size={24} className="mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-xs">Select any node on the canvas to configure its properties.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          IN-APP RESET CONFIRMATION MODAL
          ═══════════════════════════════════════════════════════════════════════ */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-[#181B26] border border-slate-200 dark:border-[#2A3042] rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-in zoom-in-95">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/30">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Reset Flow Template?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Reset this flow to the default multi-channel template? Any unsaved edits will be lost.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100 dark:border-white/5">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-[#2A3042] hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResetToTemplate}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw size={13} />
                <span>Reset Flow</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TOAST NOTIFICATION ─── */}
      {toastMessage && (
        <div className="absolute bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles size={14} className="text-crm-teal" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
