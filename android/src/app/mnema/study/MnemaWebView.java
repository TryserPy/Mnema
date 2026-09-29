package app.mnema.study;

import android.content.Context;
import android.graphics.Rect;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * WebView Мнемы. Когда в конспекте выделяешь текст, Android показывает своё меню
 * («Копировать», «Вставить»…) — в него добавляются пункты Мнемы: «В карточку», «Маркер», «Жирный»…
 * Так не нужно отдельного окошка, которое выскакивает при каждом выделении и мешает писать.
 * Какие пункты показать, говорит страница (Bridge.setSelMenu): пока курсор не в конспекте — никаких.
 */
public class MnemaWebView extends WebView {
    static final int BASE_ID = 0x4d4e00; // «MN»: номера наших пунктов меню
    static final int MAX_ITEMS = 12;
    JSONArray items = new JSONArray();
    ActionMode active; // открытое сейчас меню выделения — чтобы обновить его, если пункты поменялись

    public MnemaWebView(Context ctx) {
        super(ctx);
    }

    void setItems(String json) {
        try {
            items = json == null ? new JSONArray() : new JSONArray(json);
        } catch (Exception e) {
            items = new JSONArray();
        }
        // Меню уже открыто (пункты пришли позже долгого нажатия) — перестроить.
        if (active != null) active.invalidate();
    }

    void addItems(Menu menu) {
        // Старые пункты (курсор ушёл из конспекта) — убрать.
        for (int i = items.length(); i < MAX_ITEMS; i++) menu.removeItem(BASE_ID + i);
        for (int i = 0; i < items.length() && i < MAX_ITEMS; i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null || menu.findItem(BASE_ID + i) != null) continue;
            // Первый пункт («В карточку») — первым в меню, остальные после «Копировать».
            MenuItem m = menu.add(Menu.NONE, BASE_ID + i, i == 0 ? 0 : 100 + i, it.optString("title"));
            m.setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
        }
    }

    ActionMode.Callback wrap(final ActionMode.Callback cb) {
        return new ActionMode.Callback2() {
            @Override
            public boolean onCreateActionMode(ActionMode mode, Menu menu) {
                active = mode;
                boolean r = cb.onCreateActionMode(mode, menu);
                addItems(menu);
                return r;
            }

            @Override
            public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
                boolean r = cb.onPrepareActionMode(mode, menu);
                addItems(menu);
                return r;
            }

            @Override
            public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
                int i = item.getItemId() - BASE_ID;
                if (i >= 0 && i < items.length()) {
                    String id = items.optJSONObject(i).optString("id");
                    // Меню не закрываем сами: «Маркер» и «Жирный» оставляют выделение, а «В карточку» уберёт его и меню закроется.
                    evaluateJavascript("window.__mnemaSelAction && window.__mnemaSelAction(" + JSONObject.quote(id) + ")", null);
                    return true;
                }
                return cb.onActionItemClicked(mode, item);
            }

            @Override
            public void onDestroyActionMode(ActionMode mode) {
                if (active == mode) active = null;
                cb.onDestroyActionMode(mode);
            }

            @Override
            public void onGetContentRect(ActionMode mode, View view, Rect outRect) {
                if (cb instanceof ActionMode.Callback2) ((ActionMode.Callback2) cb).onGetContentRect(mode, view, outRect);
                else super.onGetContentRect(mode, view, outRect);
            }
        };
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback) {
        return super.startActionMode(wrap(callback));
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        return super.startActionMode(wrap(callback), type);
    }
}
