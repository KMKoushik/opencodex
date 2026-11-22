use super::*;
pub fn view(s: &State, id: &str) -> El {
    let path = format!("projects/{id}/instructions");
    let ready = pages::data(s, &path).is_some();
    let savepath = path.clone();
    let mut body=col().w_full().gap(12.0).child(label(&s.theme,"Sent with every chat in this project, on desktop and iPhone. They're saved on this computer, not in the repo; for instructions your team shares, use the repo's AGENTS.md.",13.0,400.0,"text-secondary").w_full().wrap());
    if let Some(Err(error)) = s.pages.data.get(&path) {
        let retry = path.clone();
        body = body.child(
            row()
                .w_full()
                .min_h(120.0)
                .gap(12.0)
                .center_y()
                .role("alert")
                .child(
                    label(&s.theme, error, 13.0, 400.0, "error")
                        .grow(1.0)
                        .wrap(),
                )
                .child(pages::button(s, "Retry").on_press(move |s: &mut State| s.page_get(&retry))),
        );
    } else {
        let height = s
            .pages
            .projects
            .instructions_height
            .max(260.0)
            .min((s.window_size.1 - 300.0).max(260.0));
        let input=text_input(&s.pages.instructions,TextStyle::new(13.0,400.0).lh(20.15)).key("project-instructions").label("Project instructions").w_full().h_full().px(12.0).py(10.0).radius(8.0).color(s.theme.c("text")).fill(s.theme.c("control")).border(1.0,s.theme.c("border-heavy")).border_layout().spellcheck(true)
            .disabled(!ready||s.pages.projects.busy).placeholder(if ready{"For example: Use pnpm, not npm. Run pnpm test before saying a change works. Ask before touching the database schema."}else{"Loading…"},s.theme.c("text-tertiary"))
            .on_edit(|s:&mut State|&mut s.pages.instructions)
            .on_input_change(|s:&mut State,_|s.pages.instructions_dirty=true)
            .on_input_paste(|s:&mut State,c,_|ui::limit_input(&mut s.pages.instructions,c.text(),50_000))
            .on_input_key(move|s:&mut State,e,_|{if e.key==rune::Key::Escape{close(s);true}else if e.key==rune::Key::Enter&&(e.mods.cmd||e.mods.ctrl){if ready{write(s,"instructions",path.clone(),"PUT",json!({"text":s.pages.instructions.text}));}true}else{ui::limit_key(&mut s.pages.instructions,e,50_000)}});
        let color = s.theme.c("text-tertiary");
        let shape = rune::Shape::new()
            .line([4.0, 10.0], [10.0, 4.0], 1.0, rune::LineCap::Butt, color)
            .line([8.0, 10.0], [10.0, 8.0], 1.0, rune::LineCap::Butt, color);
        body = body.child(
            el().w_full().h(height).child(input).child(
                el().key("instructions-resize")
                    .pin(None, None, Some(2.0), Some(2.0))
                    .size(12.0, 12.0)
                    .shape(shape)
                    .disabled(!ready || s.pages.projects.busy)
                    .on_drag(|s: &mut State, d, tx| {
                        tx.instant();
                        match d.phase {
                            rune::Phase::Down => {
                                d.data = s.pages.projects.instructions_height.max(260.0)
                            }
                            rune::Phase::Move => {
                                s.pages.projects.instructions_height = (d.data + d.dy)
                                    .clamp(260.0, (s.window_size.1 - 300.0).max(260.0))
                            }
                            rune::Phase::Up if d.cancelled() => {
                                s.pages.projects.instructions_height = d.data
                            }
                            _ => {}
                        }
                    }),
            ),
        );
    }
    let count = s.pages.instructions.text.encode_utf16().count();
    let hint = if count > 45_000 {
        let n = count.to_string();
        let mut grouped = String::new();
        for (i, c) in n.chars().enumerate() {
            if i > 0 && (n.len() - i) % 3 == 0 {
                grouped.push(',');
            }
            grouped.push(c);
        }
        format!("{grouped} of 50,000 characters.")
    } else {
        "Open chats use the new instructions from their next message.".into()
    };
    body = body.child(label(&s.theme, hint, 12.0, 400.0, "text-tertiary"));
    with_error(s, body).child(footer(s, ready, move |s: &mut State| {
        write(
            s,
            "instructions",
            savepath.clone(),
            "PUT",
            json!({"text":s.pages.instructions.text}),
        )
    }))
}
