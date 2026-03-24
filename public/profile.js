document.addEventListener("DOMContentLoaded", () => {
    const displayAvatar = document.querySelector(".avatar");
    const avatarBox = document.querySelector(".avatar-container");

    if (!displayAvatar || !avatarBox) return;

    let avatarsRendered = false;
    let avatarObserver = null;

    const avatarPaths = [
        "/images/Characters/sucrose.png",
        "/images/Characters/xingqiu.png",
        "/images/Characters/aether.png",
        "/images/Characters/Ganyu.png",
        "/images/Characters/xiangling.png",
        "/images/Characters/xiao.png",
        "/images/Characters/qiqi.png",
        "/images/Characters/lumine.png",
        "/images/Characters/barbara.png",
        "/images/Characters/Chongyun.png",
        "/images/Characters/bennett.png",
        "/images/Characters/amber.png",
        "/images/Characters/Albedo.png",
        "/images/Characters/noelle.png",
        "/images/Characters/fischl.png",
        "/images/Characters/xinyan.png",
        "/images/Characters/Lisa.png",
        "/images/Characters/diluc.png",
        "/images/Characters/kaeya.png",
        "/images/Characters/razor.png",
        "/images/Characters/yoimiya.png",
        "/images/Characters/yaemiko.png",
        "/images/Characters/Raiden.png",
        "/images/Characters/dainsleif.png",
        "/images/Characters/heizou.png",
        "/images/Characters/venti.png",
        "/images/Characters/hu tao.png",
        "/images/Characters/sayu.png",
        "/images/Characters/yelan.png",
        "/images/Characters/zhongli.png",
        "/images/Characters/yunjin.png",
        "/images/Characters/itto.png",
        "/images/Characters/ningugang.png",
        "/images/Characters/childe.png",
        "/images/Characters/Kazuha.png",
        "/images/Characters/mona.png",
        "/images/Characters/sara.png",
        "/images/Characters/kokomi.png",
        "/images/Characters/klee.png",
        "/images/Characters/ayaka.png",
        "/images/Characters/beidou.png",
        "/images/Characters/eula.png",
        "/images/Characters/ayato.png",
        "/images/Characters/diona.png",
        "/images/Characters/yanfei.png",
        "/images/Characters/gorou.png",
        "/images/Characters/keqing.png",
        "/images/Characters/thoma.png",
        "/images/Characters/shenhe.png",
        "/images/Characters/shinobu.png",
        "/images/Characters/rosaria.png",
        "/images/Characters/signora.png",

        "/images/Characters/Aloy_Icon.png",
        "/images/Characters/Freminet_Icon.png",
        "/images/Characters/Yaoyao_Icon.png",
        "/images/Characters/Wanderer_Icon.png",
        "/images/Characters/Klee_Skin_Blossoming_Starlight_Icon.png",
        "/images/Characters/Neuvillette_Icon.png",
        "/images/Characters/Wriothesley_Icon.png",
        "/images/Characters/Lynette_Icon.png",
        "/images/Characters/Dehya_Icon.png",
        "/images/Characters/Kaeya_Skin_Sailwind_Shadow_Icon.png",
        "/images/Characters/Alhaitham_Icon.png",

        "/images/Characters/Xinyan_Icon.png",
        "/images/Characters/Nahida_Icon.png",
        "/images/Characters/Yoimiya_Icon.png",
        "/images/Characters/Arataki_Itto_Icon.png",
        "/images/Characters/Yelan_Icon.png",
        "/images/Characters/Shikanoin_Heizou_Icon.png",
        "/images/Characters/Yun_Jin_Icon.png",
        "/images/Characters/Gorou_Icon.png",
        "/images/Characters/Collei_Icon.png",
        "/images/Characters/Kamisato_Ayato_Icon.png",
        "/images/Characters/Sangonomiya_Kokomi_Icon.png",
        "/images/Characters/Keqing_Skin_Opulent_Splendor_Icon.png",
        "/images/Characters/Thoma_Icon.png",
        "/images/Characters/Kuki_Shinobu_Icon.png",
        "/images/Characters/Paimon_Icon.png",
        "/images/Characters/Yae_Miko_Icon.png",
        "/images/Characters/Dori_Icon.png",
        "/images/Characters/Shenhe_Icon.png",
        "/images/Characters/Xiangling_Icon.png",
        "/images/Characters/Candace_Icon.png",
        "/images/Characters/Tighnari_Icon.png",
        "/images/Characters/Jean_Skin_Sea_Breeze_Dandelion_Icon.png",
        "/images/Characters/Aether_Icon.png",
        "/images/Characters/Amber_Skin_100_Outrider_Icon.png",
        "/images/Characters/Kamisato_Ayaka_Skin_Springbloom_Missive_Icon.png",
        "/images/Characters/Mika_Icon.png",
        "/images/Characters/Baizhu_Icon.png",
        "/images/Characters/Barbara_Skin_Summertime_Sparkle_Icon.png",
        "/images/Characters/Mona_Skin_Pact_of_Stars_and_Moon_Icon.png",
        "/images/Characters/Kaveh_Icon.png",
        "/images/Characters/Rosaria_Skin_To_the_Church_s_Free_Spirit_Icon.png",
        "/images/Characters/Jean_Skin_Gunnhildr_s_Legacy_Icon.png",
        "/images/Characters/Lisa_Skin_A_Sobriquet_Under_Shade_Icon.png",
        "/images/Characters/Fischl_Skin_Ein_Immernachtstraum_Icon.png",
        "/images/Characters/Lumine_Icon.png",
        "/images/Characters/Diluc_Skin_Red_Dead_of_Night_Icon.png",
        "/images/Characters/Kirara_Icon.png",
        "/images/Characters/Lyney_Icon.png",
        "/images/Characters/Ningguang_Skin_Orchid_s_Evening_Gown_Icon.png",
        "/images/Characters/Faruzan_Icon.png",

        "/images/Characters/Albedo_Icon.png",
        "/images/Characters/Amber_Icon.png",
        "/images/Characters/Barbara_Icon.png",
        "/images/Characters/Bennett_Icon.png",
        "/images/Characters/Beidou_Icon.png",
        "/images/Characters/Chongyun_Icon.png",
        "/images/Characters/Diluc_Icon.png",
        "/images/Characters/Diona_Icon.png",
        "/images/Characters/Eula_Icon.png",
        "/images/Characters/Fischl_Icon.png",
        "/images/Characters/Ganyu_Icon.png",
        "/images/Characters/Hu_Tao_Icon.png",
        "/images/Characters/Jean_Icon.png",
        "/images/Characters/Kaeya_Icon.png",
        "/images/Characters/Kaedehara_Kazuha_Icon.png",
        "/images/Characters/Klee_Icon.png",
        "/images/Characters/Ningguang_Icon.png",
        "/images/Characters/Kamisato_Ayaka_Icon.png",
        "/images/Characters/Noelle_Icon.png",
        "/images/Characters/Mona_Icon.png",
        "/images/Characters/Qiqi_Icon.png",
        "/images/Characters/Keqing_Icon.png",
        "/images/Characters/Razor_Icon.png",
        "/images/Characters/Lisa_Icon.png",
        "/images/Characters/Sucrose_Icon.png",
        "/images/Characters/Venti_Icon.png",
        "/images/Characters/Zhongli_Icon.png",
        "/images/Characters/Rosaria_Icon.png",
        "/images/Characters/Tartaglia_Icon.png",
        "/images/Characters/Xiao_Icon.png",
        "/images/Characters/Xingqiu_Icon.png",
        "/images/Characters/Cyno_Icon.png",
        "/images/Characters/Kujou_Sara_Icon.png",
        "/images/Characters/Yanfei_Icon.png",
        "/images/Characters/Sayu_Icon.png",
        "/images/Characters/Layla_Icon.png",
        "/images/Characters/Raiden_Shogun_Icon.png",
        "/images/Characters/Nilou_Icon.png",
        "/images/Characters/Traveler_Icon.png",
        "/images/Characters/marvel_11892423.png",
        "/images/Characters/man_11892431.png",
        "/images/Characters/iron_11892457.png",
        "/images/Characters/avengers_11892429.png",
        "/images/Characters/mcu_11892386.png",
        "/images/Characters/star_3119077.png",
        "/images/Characters/marvel_11892414.png",
        "/images/Characters/marvel_11892408.png"

    ];

    function closeAvatarBox() {
        avatarBox.style.display = "none";
    }

    function openAvatarBox() {
        avatarBox.style.display = "flex";

        if (!avatarsRendered) {
            renderAvatars();
            avatarsRendered = true;
        }
    }

    function toggleAvatarBox() {
        const isOpen = window.getComputedStyle(avatarBox).display !== "none";
        if (isOpen) {
            closeAvatarBox();
        } else {
            openAvatarBox();
        }
    }

    function setDisplayAvatar(path) {
        displayAvatar.classList.add("has-image");
        displayAvatar.innerHTML = `<img class="avatar-img" src="${path}" alt="avatar">`;
    }

    function createObserver() {
        if (!("IntersectionObserver" in window)) return null;

        return new IntersectionObserver(
            (entries, observer) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;

                    const img = entry.target;
                    const realSrc = img.dataset.src;

                    if (realSrc) {
                        img.src = realSrc;
                        img.removeAttribute("data-src");
                    }

                    observer.unobserve(img);
                });
            },
            {
                root: avatarBox,
                rootMargin: "150px"
            }
        );
    }

    async function saveAvatar(path) {
        const res = await fetch("/set_avatar", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                avatarPath: path
            })
        });

        let data;
        try {
            data = await res.json();
        } catch {
            throw new Error("Invalid server response");
        }

        if (!res.ok || !data.success) {
            throw new Error("Avatar save failed");
        }

        return data;
    }

    function renderAvatars() {
        avatarBox.innerHTML = "";
        avatarObserver = createObserver();

        avatarPaths.forEach((path) => {
            const customAvtr = document.createElement("div");
            customAvtr.classList.add("custom-avatar");

            const imgAvatar = document.createElement("img");
            imgAvatar.classList.add("avatar-img");
            imgAvatar.alt = "avatar option";
            imgAvatar.loading = "lazy";
            imgAvatar.decoding = "async";

            if (avatarObserver) {
                imgAvatar.dataset.src = path;
                avatarObserver.observe(imgAvatar);
            } else {
                imgAvatar.src = path;
            }

            customAvtr.addEventListener("click", async () => {
                try {
                    await saveAvatar(path);
                    setDisplayAvatar(path);
                    closeAvatarBox();
                } catch (err) {
                    console.error("Avatar update error:", err);
                    alert("Server error");
                }
            });

            customAvtr.appendChild(imgAvatar);
            avatarBox.appendChild(customAvtr);
        });
    }

    displayAvatar.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleAvatarBox();
    });

    avatarBox.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    document.addEventListener("click", (e) => {
        const clickedInsideAvatar = displayAvatar.contains(e.target);
        const clickedInsideBox = avatarBox.contains(e.target);

        if (!clickedInsideAvatar && !clickedInsideBox) {
            closeAvatarBox();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeAvatarBox();
        }
    });
});