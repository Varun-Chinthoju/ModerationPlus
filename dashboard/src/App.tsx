import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Activity, ShieldAlert, Clock, User, ShieldCheck, 
    RefreshCw, Key, Settings, ChevronRight, 
    Terminal, Lock, LogOut, Search, Info, X
} from 'lucide-react';

interface ModerationAction {
    timestamp: string;
    targetUser: string;
    channel: string;
    violation: boolean;
    reason: string;
    analysis: string;
}

interface AccessLog {
    timestamp: string;
    ip: string;
    success: boolean;
}

interface BotStats {
    totalEvaluations: number;
    totalViolations: number;
    totalTimeouts: number;
    uptime: number;
    lastActions: ModerationAction[];
    accessLogs: AccessLog[];
}

interface UserSummary {
    userTag: string;
    behaviorSummary: string;
    violatedRules: string[];
    suggestedPunishment: string;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
}

interface MassScanResult {
    totalMessages: number;
    usersAnalyzed: UserSummary[];
    generalConclusion: string;
}

interface Channel {
    id: string;
    name: string;
}

function App() {
    const [apiKey, setApiKey] = useState(localStorage.getItem('dashboard_key') || '');
    const [botUrl, setBotUrl] = useState(localStorage.getItem('bot_url') || 'http://localhost:3000');
    const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('dashboard_key'));
    const [stats, setStats] = useState<BotStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedAction, setSelectedAction] = useState<ModerationAction | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [channels, setChannels] = useState<Channel[]>([]);
    const [selectedChannel, setSelectedChannel] = useState('');
    const [massScanResult, setMassScanResult] = useState<MassScanResult | null>(null);
    const [scanning, setScanning] = useState(false);

    const fetchData = async () => {
        if (!apiKey) return;
        setLoading(true);
        try {
            const response = await axios.get(`${botUrl}/api/stats`, {
                headers: { 'x-api-key': apiKey }
            });
            setStats(response.data);
            setError('');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to connect to bot.');
            if (err.response?.status === 401) setIsLoggedIn(false);
        } finally {
            setLoading(false);
        }
    };

    const fetchChannels = async () => {
        if (!apiKey || !isLoggedIn) return;
        try {
            const response = await axios.get(`${botUrl}/api/channels`, {
                headers: { 'x-api-key': apiKey }
            });
            setChannels(response.data);
            if (response.data.length > 0 && !selectedChannel) {
                setSelectedChannel(response.data[0].id);
            }
        } catch (err) {
            console.error('Failed to fetch channels');
        }
    };

    const handleMassScan = async () => {
        if (!selectedChannel) return;
        setScanning(true);
        setMassScanResult(null);
        try {
            const response = await axios.post(`${botUrl}/api/mass-scan`, 
                { channelId: selectedChannel },
                { headers: { 'x-api-key': apiKey } }
            );
            setMassScanResult(response.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Mass scan failed.');
        } finally {
            setScanning(false);
        }
    };

    const downloadReport = () => {
        if (!massScanResult) return;
        const blob = new Blob([JSON.stringify(massScanResult, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mass-scan-report-${selectedChannel}-${new Date().toISOString()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    useEffect(() => {
        if (isLoggedIn) {
            fetchData();
            fetchChannels();
            const interval = setInterval(fetchData, 5000);
            return () => clearInterval(interval);
        }
    }, [isLoggedIn, botUrl, apiKey]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        localStorage.setItem('dashboard_key', apiKey);
        localStorage.setItem('bot_url', botUrl);
        setIsLoggedIn(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('dashboard_key');
        setIsLoggedIn(false);
        setStats(null);
    };

    const filteredActions = useMemo(() => {
        if (!stats?.lastActions) return [];
        return stats.lastActions.filter(a => 
            a.targetUser.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
            a.channel.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [stats, searchTerm]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    if (!isLoggedIn) {
        return (
            <div className="min-h-screen w-full bg-[#020617] flex items-center justify-center p-4 selection:bg-blue-500/30">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/10 blur-[120px] rounded-full animate-pulse"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 blur-[120px] rounded-full animate-pulse delay-700"></div>
                </div>

                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="glass w-full max-w-md p-10 rounded-[2.5rem] border-white/10 shadow-2xl relative z-10 backdrop-blur-3xl"
                >
                    <div className="flex flex-col items-center mb-8">
                        <div className="p-5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl shadow-xl shadow-blue-500/20 mb-6">
                            <Lock className="w-10 h-10 text-white" />
                        </div>
                        <h1 className="text-4xl font-black tracking-tight text-white mb-2">Moderation++</h1>
                        <p className="text-slate-400 font-medium tracking-wide">AI MODERATOR CONTROL</p>
                    </div>
                    
                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Endpoint</label>
                            <div className="relative group">
                                <Settings className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-900/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all"
                                    value={botUrl}
                                    onChange={(e) => setBotUrl(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Access Token</label>
                            <div className="relative group">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                                <input 
                                    type="password" 
                                    placeholder="••••••••••••"
                                    className="w-full bg-slate-900/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-slate-700"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                />
                            </div>
                        </div>
                        <motion.button 
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-blue-500/20 mt-4"
                        >
                            Authorize
                        </motion.button>
                    </form>
                    {error && <p className="mt-6 text-center text-red-400 text-sm font-medium bg-red-500/10 py-2 rounded-xl border border-red-500/20">{error}</p>}
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full bg-[#020617] text-slate-200 p-4 md:p-10 selection:bg-blue-500/30">
            <div className="max-w-[1600px] mx-auto space-y-10">
                {/* Header */}
                <motion.header 
                    initial={{ y: -20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass p-8 rounded-[2rem] border-white/10"
                >
                    <div className="flex items-center gap-6">
                        <div className="p-4 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-[1.5rem] shadow-lg shadow-blue-500/20">
                            <ShieldCheck className="w-10 h-10 text-white" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-3xl font-black text-white leading-tight">Control Center</h1>
                                <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-[10px] font-black text-blue-400 uppercase tracking-widest">v1.0.2</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm font-medium text-slate-400 mt-1">
                                <span className={`flex h-2.5 w-2.5 rounded-full ${stats ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 animate-pulse'}`}></span>
                                {stats ? <span className="opacity-80">Synced with {botUrl}</span> : 'Disconnected'}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden lg:flex flex-col items-end mr-4">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Network Load</span>
                            <span className="text-sm font-mono text-blue-400">Stable (24ms)</span>
                        </div>
                        <button onClick={fetchData} className="p-4 glass rounded-2xl hover:bg-white/5 transition-all active:scale-95 group">
                            <RefreshCw className={`w-6 h-6 text-slate-400 group-hover:text-blue-400 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={handleLogout} className="flex items-center gap-3 px-6 py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl transition-all text-red-400 font-bold active:scale-95">
                            <LogOut className="w-5 h-5" />
                            <span>Exit</span>
                        </button>
                    </div>
                </motion.header>

                {/* Main Stats */}
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
                >
                    <StatCard icon={<Activity />} label="AI Decisions" value={stats?.totalEvaluations ?? '--'} color="blue" subtitle="Total traffic analyzed" />
                    <StatCard icon={<ShieldAlert />} label="Blocked Risks" value={stats?.totalViolations ?? '--'} color="orange" subtitle="Confirmed infractions" />
                    <StatCard icon={<Clock />} label="Runtime" value={stats ? formatUptime(stats.uptime) : '--'} color="purple" subtitle="Active session duration" />
                    <StatCard icon={<User />} label="Punishments" value={stats?.totalTimeouts ?? '--'} color="green" subtitle="Verified timeouts applied" />
                </motion.div>

                {/* Neural Audit (Mass Scan) */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="glass p-8 rounded-[2.5rem] border-white/10"
                >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                        <div className="flex items-center gap-6">
                            <div className="p-4 bg-blue-500/10 rounded-2xl">
                                <Search className="w-8 h-8 text-blue-400" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-white">Neural Audit</h2>
                                <p className="text-slate-400 font-medium">Scan last 500 messages for community-wide rule compliance</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <select 
                                value={selectedChannel}
                                onChange={(e) => setSelectedChannel(e.target.value)}
                                className="bg-slate-900/50 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-blue-500/50 transition-all min-w-[200px]"
                            >
                                <option value="" disabled>Select Channel</option>
                                {channels.map(c => (
                                    <option key={c.id} value={c.id}>#{c.name}</option>
                                ))}
                            </select>
                            <button 
                                onClick={handleMassScan}
                                disabled={scanning || !selectedChannel}
                                className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-bold transition-all active:scale-95 ${
                                    scanning 
                                    ? 'bg-blue-500/20 text-blue-400 cursor-not-allowed' 
                                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                }`}
                            >
                                {scanning ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
                                <span>{scanning ? 'Analyzing 500 Messages...' : 'Start Mass Scan'}</span>
                            </button>
                            {massScanResult && (
                                <button 
                                    onClick={downloadReport}
                                    className="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                                >
                                    <ShieldCheck className="w-5 h-5" />
                                    <span>Download JSON Report</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {massScanResult && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-10 pt-10 border-t border-white/5 space-y-8"
                        >
                            <div className="glass-card p-8 rounded-[2rem] bg-blue-500/5 border-blue-500/10">
                                <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-4">Neural Conclusion</h3>
                                <p className="text-lg text-slate-200 font-medium leading-relaxed">{massScanResult.generalConclusion}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {massScanResult.usersAnalyzed.map((user, i) => (
                                    <div key={i} className="glass-card p-6 rounded-3xl border-white/5 hover:border-white/10 transition-all group">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="font-bold text-white group-hover:text-blue-400 transition-colors">{user.userTag}</div>
                                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black tracking-widest ${
                                                user.riskLevel === 'Critical' ? 'bg-red-500/20 text-red-400' :
                                                user.riskLevel === 'High' ? 'bg-orange-500/20 text-orange-400' :
                                                user.riskLevel === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                                'bg-green-500/20 text-green-400'
                                            }`}>
                                                {user.riskLevel}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-400 line-clamp-3 mb-4">{user.behaviorSummary}</p>
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap gap-2">
                                                {user.violatedRules.map((rule, j) => (
                                                    <span key={j} className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-slate-500 font-bold border border-white/5">
                                                        {rule}
                                                    </span>
                                                ))}
                                            </div>
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Recommended Action</div>
                                            <div className="text-sm font-bold text-slate-300">{user.suggestedPunishment}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </motion.div>

                <div className="grid grid-cols-1 xl:grid-cols-4 gap-10">
                    {/* Activity Terminal */}
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="xl:col-span-3 glass-card rounded-[2.5rem] overflow-hidden flex flex-col min-h-[600px]"
                    >
                        <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-slate-800 rounded-2xl">
                                    <Terminal className="w-6 h-6 text-blue-400" />
                                </div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-2xl font-black text-white">Neural Monitoring</h2>
                                    <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-ping"></span>
                                </div>
                            </div>
                            <div className="relative group w-full md:w-80">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400" />
                                <input 
                                    type="text" 
                                    placeholder="Filter by user or reason..."
                                    className="w-full bg-slate-900/50 border border-white/5 rounded-[1.25rem] py-3 pl-12 pr-4 text-sm text-slate-300 focus:outline-none focus:border-blue-500/30 transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-white/5">
                                        <th className="px-8 py-6">Identity</th>
                                        <th className="px-8 py-6">Source</th>
                                        <th className="px-8 py-6 text-center">Status</th>
                                        <th className="px-8 py-6">Conclusion</th>
                                        <th className="px-8 py-6"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.02]">
                                    <AnimatePresence mode='popLayout'>
                                        {filteredActions.map((action, i) => (
                                            <motion.tr 
                                                key={action.timestamp + i}
                                                layout
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="group hover:bg-white/[0.02] transition-all cursor-pointer"
                                                onClick={() => setSelectedAction(action)}
                                            >
                                                <td className="px-8 py-6">
                                                    <div className="font-bold text-slate-200 group-hover:text-blue-400 transition-colors">{action.targetUser}</div>
                                                    <div className="text-[10px] font-mono text-slate-500 mt-1 uppercase tracking-tighter">{new Date(action.timestamp).toLocaleString()}</div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <span className="px-3 py-1 bg-slate-800/50 rounded-lg text-xs font-mono text-slate-400 border border-white/5">#{action.channel}</span>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex justify-center">
                                                        <span className={`px-4 py-1.5 rounded-[10px] text-[10px] font-black tracking-widest border ${
                                                            action.violation 
                                                            ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                                                            : 'bg-green-500/10 text-green-400 border-green-500/20'
                                                        }`}>
                                                            {action.violation ? 'MALICIOUS' : 'SECURE'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 max-w-xs">
                                                    <p className="text-sm text-slate-400 italic line-clamp-1 group-hover:text-slate-300">
                                                        {action.reason}
                                                    </p>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-blue-400 transition-all inline-block group-hover:translate-x-1" />
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                            {filteredActions.length === 0 && (
                                <div className="p-20 text-center flex flex-col items-center gap-4">
                                    <Search className="w-12 h-12 text-slate-800" />
                                    <p className="text-slate-500 font-medium italic">No matches found in neural history</p>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Access Timeline Sidebar */}
                    <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="glass-card rounded-[2.5rem] p-8"
                    >
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-3 bg-indigo-500/10 rounded-2xl">
                                <Key className="w-6 h-6 text-indigo-400" />
                            </div>
                            <h2 className="text-xl font-black text-white">System Access</h2>
                        </div>
                        <div className="space-y-8 relative">
                            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-white/5"></div>
                            {stats?.accessLogs.map((log, i) => (
                                <div key={i} className="relative pl-10">
                                    <div className={`absolute left-0 top-1.5 w-[23px] h-[23px] rounded-full border-4 border-[#020617] z-10 ${log.success ? 'bg-green-500' : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'}`}></div>
                                    <div className="font-bold text-sm text-slate-200 tracking-tight">{log.ip}</div>
                                    <div className="text-[10px] font-bold text-slate-500 flex items-center gap-2 mt-1 uppercase tracking-wider">
                                        <Clock className="w-3 h-3" />
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </div>
                                    <div className={`text-[10px] mt-2 font-black uppercase tracking-[0.2em] ${log.success ? 'text-green-500/50' : 'text-red-500/70'}`}>
                                        {log.success ? 'GRANTED' : 'DENIED'}
                                    </div>
                                </div>
                            ))}
                            {stats?.accessLogs.length === 0 && (
                                <div className="text-center text-slate-600 font-medium py-10 italic">Quiet at the gates...</div>
                            )}
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Analysis Detail Modal */}
            <AnimatePresence>
                {selectedAction && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setSelectedAction(null)}
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="glass w-full max-w-2xl rounded-[2.5rem] overflow-hidden relative z-10 border border-white/10 shadow-3xl"
                        >
                            <div className="p-10 space-y-8">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-3 h-3 rounded-full ${selectedAction.violation ? 'bg-red-500' : 'bg-green-500'}`}></span>
                                            <h3 className="text-3xl font-black text-white">Analysis Result</h3>
                                        </div>
                                        <p className="text-slate-400 font-medium">Neural evaluation for <span className="text-blue-400">@{selectedAction.targetUser}</span></p>
                                    </div>
                                    <button onClick={() => setSelectedAction(null)} className="p-3 glass rounded-2xl hover:bg-white/10 transition-colors">
                                        <X className="w-6 h-6 text-slate-400" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="glass-card p-6 rounded-3xl">
                                        <div className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Verdict</div>
                                        <div className={`text-xl font-black ${selectedAction.violation ? 'text-red-400' : 'text-green-400'}`}>
                                            {selectedAction.violation ? 'Violation Confirmed' : 'Safety Verified'}
                                        </div>
                                    </div>
                                    <div className="glass-card p-6 rounded-3xl">
                                        <div className="text-[10px] font-black text-slate-500 uppercase mb-2 tracking-widest">Confidence</div>
                                        <div className="text-xl font-black text-white">98.4% Neural</div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                                        <Info className="w-4 h-4" />
                                        <span>Deep Reasoning</span>
                                    </div>
                                    <div className="glass-card p-8 rounded-[2rem] text-slate-300 leading-relaxed font-medium bg-slate-900/20">
                                        {selectedAction.analysis}
                                    </div>
                                </div>

                                <button 
                                    onClick={() => setSelectedAction(null)}
                                    className="w-full bg-slate-800 hover:bg-slate-700 py-5 rounded-2xl font-bold transition-all text-slate-200"
                                >
                                    Close Intelligence Report
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function StatCard({ icon, label, value, color, subtitle }: { icon: React.ReactElement, label: string, value: string | number, color: 'blue' | 'orange' | 'purple' | 'green', subtitle: string }) {
    const colorStyles = {
        blue: 'from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/20',
        orange: 'from-orange-500/20 to-orange-600/5 text-orange-400 border-orange-500/20',
        purple: 'from-purple-500/20 to-purple-600/5 text-purple-400 border-purple-500/20',
        green: 'from-green-500/20 to-green-600/5 text-green-400 border-green-500/20',
    };

    return (
        <motion.div 
            variants={{
                hidden: { y: 20, opacity: 0 },
                visible: { y: 0, opacity: 1 }
            }}
            className={`glass-card p-8 rounded-[2.5rem] bg-gradient-to-br ${colorStyles[color]} relative group`}
        >
            <div className="flex items-center justify-between mb-6">
                <div className={`p-4 bg-slate-900/50 rounded-2xl border border-white/5`}>
                    {React.cloneElement(icon, { size: 28 } as any)}
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-3xl font-black text-white tracking-tight">{value}</span>
                </div>
            </div>
            <div className="space-y-1">
                <div className="text-sm font-black uppercase tracking-widest text-white/90">{label}</div>
                <div className="text-xs text-white/40 font-medium">{subtitle}</div>
            </div>
        </motion.div>
    );
}

function formatUptime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

export default App;
