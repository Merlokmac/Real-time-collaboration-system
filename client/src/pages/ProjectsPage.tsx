/*
 * Trang Dự án của tôi.
 *
 * Luồng tải danh sách:
 *   - Ô tìm kiếm cập nhật `query` ngay khi gõ; `useDebounce` chờ 300ms ngừng gõ mới đổi `debouncedQuery`.
 *   - Mỗi khi `debouncedQuery` (hoặc `reloadKey` khi bấm Thử lại) đổi → gọi GET /projects?q=...
 *     Request cũ bị hủy bằng AbortController, nên kết quả về muộn của lần gõ trước không ghi đè lần sau.
 *   - "Đang tải" không lưu thành state riêng mà suy ra: kết quả đang có thuộc về request nào (`result.key`)
 *     khác với request hiện tại (`requestKey`) nghĩa là đang chờ. Trong lúc chờ vẫn giữ danh sách cũ (làm mờ)
 *     để trang không bị nhảy mỗi lần gõ.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '../api/client';
import { listProjects } from '../api/projects';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { Spinner } from '../components/common/Spinner';
import { TextField } from '../components/common/TextField';
import { InvitationsPanel } from '../components/invitations/InvitationsPanel';
import { PageContainer } from '../components/layout/AppLayout';
import { CreateProjectModal } from '../components/project/CreateProjectModal';
import { ProjectCard } from '../components/project/ProjectCard';
import { useDebounce } from '../hooks/useDebounce';
import type { ProjectSummary } from '../types';
import styles from './ProjectsPage.module.css';

type Result = { key: string; items: ProjectSummary[]; error?: undefined } | { key: string; items?: undefined; error: string };

export function ProjectsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 300);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  // Giữ danh sách thành công gần nhất để hiển thị trong lúc tải lần tiếp theo
  const [lastItems, setLastItems] = useState<ProjectSummary[] | null>(null);
  const [creating, setCreating] = useState(false);

  const requestKey = `${debouncedQuery}#${reloadKey}`;

  useEffect(() => {
    const controller = new AbortController();
    listProjects({ q: debouncedQuery, signal: controller.signal })
      .then((items) => {
        setResult({ key: requestKey, items });
        setLastItems(items);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, error: getErrorMessage(err) });
      });
    return () => controller.abort();
  }, [debouncedQuery, requestKey]);

  const loading = result?.key !== requestKey;
  const error = !loading ? result?.error : undefined;
  const items = !loading && result?.items ? result.items : lastItems;
  const searching = debouncedQuery !== '';

  const reload = () => setReloadKey((k) => k + 1);

  function renderList() {
    // Lần đầu vào trang, chưa có gì để hiện
    if (loading && !items) {
      return (
        <div className={styles.center}>
          <Spinner size="lg" label="Đang tải danh sách dự án" />
        </div>
      );
    }
    if (error) {
      return (
        <div className={styles.errorBox}>
          <ErrorMessage>Không tải được danh sách dự án. {error}</ErrorMessage>
          <Button variant="secondary" onClick={reload}>
            Thử lại
          </Button>
        </div>
      );
    }
    if (!items || items.length === 0) {
      return searching ? (
        <div className={styles.empty}>
          <p>
            Không có dự án nào có tên chứa “<strong>{debouncedQuery}</strong>”.
          </p>
          <Button variant="secondary" onClick={() => setQuery('')}>
            Xóa tìm kiếm
          </Button>
        </div>
      ) : (
        <div className={styles.empty}>
          <p>Bạn chưa tham gia dự án nào.</p>
          <p className={styles.muted}>Tạo dự án mới, hoặc chờ lời mời từ chủ dự án khác.</p>
          <Button onClick={() => setCreating(true)}>Tạo dự án đầu tiên</Button>
        </div>
      );
    }
    return (
      <ul className={`${styles.grid} ${loading ? styles.stale : ''}`} aria-busy={loading}>
        {items.map((project) => (
          <li key={project.id}>
            <ProjectCard project={project} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <PageContainer>
      <div className={styles.page}>
        <div className={styles.titleRow}>
          <h1>Dự án của tôi</h1>
          <Button onClick={() => setCreating(true)}>+ Tạo dự án</Button>
        </div>

        <div className={styles.toolbar}>
          <TextField
            label="Tìm dự án"
            className={styles.search}
            type="search"
            name="q"
            placeholder="Nhập tên dự án…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
            autoComplete="off"
          />
          {loading && items && (
            <span className={styles.inlineLoading}>
              <Spinner size="sm" /> Đang tìm…
            </span>
          )}
        </div>

        <InvitationsPanel onAccepted={reload} />

        {renderList()}
      </div>

      {creating && (
        <CreateProjectModal
          onClose={() => setCreating(false)}
          onCreated={(project) => navigate(`/projects/${project.id}`)}
        />
      )}
    </PageContainer>
  );
}
