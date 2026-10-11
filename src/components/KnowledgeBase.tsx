import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { KnowledgeArticle } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Book, ChevronRight, Eye, Calendar, User, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../services/AuthContext';
import { adminService } from '../services/adminService';

export const KnowledgeBase: React.FC = () => {
  const { user } = useAuth();
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<string | null>(null);
  const [newArticle, setNewArticle] = useState({ title: '', content: '', category: 'General' });

  const mounted = useRef(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    mounted.current = true;
    loadArticles(true);
    return () => { mounted.current = false; };
  }, []);

  // Escape closes the delete dialog / the new-article form
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showDeleteModal) { setShowDeleteModal(false); setArticleToDelete(null); }
      else if (isAdding) setIsAdding(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDeleteModal, isAdding]);

  const loadArticles = async (isInitial: any = false) => {
    if (isInitial === true) setIsLoading(true);
    try {
      const data = await adminService.getArticles();
      if (!mounted.current) return;
      const list: KnowledgeArticle[] = Array.isArray(data) ? data : [];
      setArticles(list);
      setLoadError(null);
      // keep the open article in sync with the fresh list (views, edits) or close it if it is gone
      setSelectedArticle(prev => (prev ? list.find(x => String(x.id) === String(prev.id)) || null : prev));
    } catch (err: any) {
      if (!mounted.current) return;
      setLoadError(err?.message || 'Failed to load articles');
      toast.error('Could not load the knowledge base. Please try again.');
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  };

  const handleAddArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      await adminService.addArticle({
        ...newArticle,
        author: user.name
      });
      setIsAdding(false);
      setNewArticle({ title: '', content: '', category: 'General' });
      toast.success('Article published');
      loadArticles();
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong. Please try again.');
    }
  };

  const handleDeleteArticle = async (id: string) => {
    setArticleToDelete(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!articleToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await adminService.deleteArticle(articleToDelete, user?.id != null ? String(user.id) : undefined, user?.name);
      if (selectedArticle?.id === articleToDelete) setSelectedArticle(null);
      setShowDeleteModal(false);
      setArticleToDelete(null);
      loadArticles();
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong. Please try again.');
    } finally {
      if (mounted.current) setIsDeleting(false);
    }
  };

  const filteredArticles = articles.filter(a => 
    (a.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (a.content?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (a.category?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  if (isLoading) return <div className="p-8" role="status" aria-live="polite">Loading Knowledge Base...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-brand-black">Knowledge Base</h2>
          <p className="text-brand-gray">Find solutions to common IT issues</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
          {user?.role === 'Admin' && (
            <button 
              onClick={() => setIsAdding(true)}
              className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Plus size={18} /> New Article
            </button>
          )}
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray" size={20} />
            <input
              type="text"
              placeholder="Search articles..."
              className="input-field pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bento-card mb-8 bg-slate-50 border-slate-200"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-xl">Create New Article</h3>
              <button onClick={() => setIsAdding(false)} aria-label="Close form" className="text-brand-gray hover:text-brand-red">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddArticle} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Title</label>
                  <input 
                    className="input-field" 
                    placeholder="Article Title" 
                    value={newArticle.title}
                    onChange={e => setNewArticle({...newArticle, title: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Category</label>
                  <select 
                    className="input-field"
                    value={newArticle.category}
                    onChange={e => setNewArticle({...newArticle, category: e.target.value})}
                  >
                    <option value="General">General</option>
                    <option value="Hardware">Hardware</option>
                    <option value="Software">Software</option>
                    <option value="Network">Network</option>
                    <option value="Oracle">Oracle</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">Content</label>
                <textarea 
                  className="input-field min-h-[200px]" 
                  placeholder="Write your article content here..." 
                  value={newArticle.content}
                  onChange={e => setNewArticle({...newArticle, content: e.target.value})}
                  required
                />
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsAdding(false)} className="btn-secondary">Cancel</button>
                <button type="submit" className="btn-primary px-8">Publish Article</button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-center gap-3 text-brand-red mb-4">
              <Trash2 size={24} />
              <h3 className="text-lg font-bold">Delete Article</h3>
            </div>
            <p className="text-sm text-brand-gray mb-6">
              Are you sure you want to delete this article? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setShowDeleteModal(false);
                  setArticleToDelete(null);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                disabled={isDeleting}
                className="btn-primary bg-brand-red hover:bg-red-700"
              >
                Delete Permanently
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-8 ${selectedArticle ? 'h-full' : ''}`}>
        <div className={`lg:col-span-1 space-y-4 ${selectedArticle ? 'hidden lg:block' : 'block'}`}>
          <h3 className="font-bold text-brand-black flex items-center gap-2">
            <Book size={18} className="text-brand-red" />
            Articles
          </h3>
          <div className="space-y-2">
            {loadError && articles.length === 0 && (
              <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
                Could not load articles: {loadError}{' '}
                <button onClick={() => loadArticles(true)} className="underline font-bold">Retry</button>
              </div>
            )}
            {filteredArticles.map(article => (
              <button
                key={article.id}
                onClick={() => setSelectedArticle(article)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selectedArticle?.id === article.id 
                    ? 'bg-brand-red border-brand-red text-white shadow-lg' 
                    : 'bg-white border-black/5 hover:border-brand-red/30 text-brand-black'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="font-bold text-sm line-clamp-2">{article.title}</span>
                  <ChevronRight size={16} className={selectedArticle?.id === article.id ? 'text-white' : 'text-brand-gray'} />
                </div>
                <div className={`text-[10px] mt-2 flex items-center gap-3 ${selectedArticle?.id === article.id ? 'text-white/80' : 'text-brand-gray'}`}>
                  <span className="flex items-center gap-1"><Eye size={10} /> {article.views ?? '—'}</span>
                  <span className="bg-black/5 px-2 py-0.5 rounded-full">{article.category}</span>
                </div>
              </button>
            ))}
            {filteredArticles.length === 0 && !loadError && (
              <p className="text-sm text-brand-gray text-center py-8">No articles found matching your search.</p>
            )}
          </div>
        </div>

        <div className={`lg:col-span-2 ${selectedArticle ? 'block' : 'hidden lg:block'}`}>
          <AnimatePresence mode="wait">
            {selectedArticle ? (
              <motion.div
                key={selectedArticle.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-black/5 min-h-[400px]"
              >
                <button 
                  onClick={() => setSelectedArticle(null)}
                  className="lg:hidden flex items-center gap-2 text-brand-gray mb-6 font-bold text-xs uppercase"
                >
                  <ChevronRight size={16} className="rotate-180" /> Back to Articles
                </button>

                <div className="mb-6 pb-6 border-b border-black/5">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 text-brand-red text-xs font-bold uppercase tracking-wider">
                      {selectedArticle.category}
                    </div>
                    {user?.role === 'Admin' && (
                      <button 
                        onClick={() => handleDeleteArticle(selectedArticle.id)}
                        className="text-brand-gray hover:text-brand-red transition-colors"
                        title="Delete Article"
                        aria-label="Delete article"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                  <h1 className="text-3xl font-bold text-brand-black mb-4">{selectedArticle.title}</h1>
                  <div className="flex flex-wrap gap-4 text-xs text-brand-gray">
                    <span className="flex items-center gap-1"><User size={14} /> {selectedArticle.author}</span>
                    <span className="flex items-center gap-1"><Calendar size={14} /> {selectedArticle.createdAt && !isNaN(new Date(selectedArticle.createdAt).getTime()) ? new Date(selectedArticle.createdAt).toLocaleDateString() : '—'}</span>
                    <span className="flex items-center gap-1"><Eye size={14} /> {selectedArticle.views ?? '—'} views</span>
                  </div>
                </div>
                {/* Article content is rendered strictly as text (React-escaped): never as HTML. If rich
                    content is ever needed, sanitize with DOMPurify first. */}
                <div className="prose prose-slate max-w-none text-brand-black leading-relaxed">
                  {(selectedArticle.content || '').split('\n').map((para, i) => (
                    <p key={i} className="mb-4">{para}</p>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="bg-brand-light/50 border-2 border-dashed border-black/5 rounded-2xl flex flex-col items-center justify-center p-12 text-center h-full min-h-[400px]">
                <Book size={48} className="text-brand-gray/30 mb-4" />
                <h3 className="text-xl font-bold text-brand-black">Select an article</h3>
                <p className="text-brand-gray max-w-xs mt-2">Choose an article from the list to view its contents and solutions.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
